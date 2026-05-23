import env from '@/helpers/env'
import { findOrCreateDownloadJob } from '@/models/downloadJobFunctions'
import { findOrCreateDownloadRequest } from '@/models/downloadRequestFunctions'
import Context from '@/models/Context'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import MessageEditor from '@/helpers/MessageEditor'
import augmentError from '@/helpers/augmentError'
import checkForCachedUrlAndSendFile from '@/helpers/checkForCachedUrlAndSendFile'
import downloadQueue from '@/helpers/downloadQueue'
import {
  cooldownRemainingSeconds,
  isOnCooldown,
  touchCooldown,
} from '@/helpers/cooldown'
import {
  blockedUserMessage,
  isBlockedUser,
  validationMessage,
} from '@/helpers/validationMessages'
import report from '@/helpers/report'
import { isValidationError, ValidationError } from '@/lib/errors'
import logger from '@/lib/logger'
import { assertUserJobLimits } from '@/services/jobGuards'
import { probeUrlMetadata } from '@/services/ytdlpProbe'
import { preflightUrl } from '@/services/urlPreflight'
import { normalizeUrl } from '@/services/urlNormalize'
import { recordDownloadFailure } from '@/helpers/userAbuse'

export default async function createDownloadJobAndRequest(
  ctx: Context,
  rawUrl: string
) {
  const url = normalizeUrl(rawUrl)
  ctx.dbchat.lastUrl = url
  await ctx.dbchat.save()

  if (isOnCooldown(ctx.dbchat.telegramId)) {
    const seconds = cooldownRemainingSeconds(ctx.dbchat.telegramId)
    return ctx.reply(
      ctx.i18n.t('error_cooldown', { seconds: String(seconds) })
    )
  }

  if (isBlockedUser(ctx)) {
    return ctx.reply(blockedUserMessage(ctx))
  }

  const downloadMessageEditor = new MessageEditor(undefined, ctx)
  const statusMsg = await ctx.reply(ctx.i18n.t('status_validating'))
  downloadMessageEditor.messageId = statusMsg.message_id

  try {
    const checkedUrl = await preflightUrl(url)
    await assertUserJobLimits(ctx.dbchat.telegramId, checkedUrl, ctx.dbchat.audio)
    if (!env.SKIP_YTDLP_PROBE) {
      try {
        await probeUrlMetadata(checkedUrl)
      } catch (probeError) {
        if (
          env.SOFT_YTDLP_PROBE &&
          isValidationError(probeError) &&
          probeError.code !== 'youtube_bot'
        ) {
          logger.warn('soft probe: continuing to download', {
            url: checkedUrl,
            code: probeError.code,
            detail: probeError.message,
          })
        } else {
          throw probeError
        }
      }
    }

    try {
      const cached = await checkForCachedUrlAndSendFile(
        checkedUrl,
        ctx,
        downloadMessageEditor
      )
      if (cached) {
        touchCooldown(ctx.dbchat.telegramId)
        return
      }
    } catch (error) {
      throw augmentError(error, 'check cache and send file')
    }

    touchCooldown(ctx.dbchat.telegramId)

    const waitSec = downloadQueue.getEstimatedWaitSeconds()
    if (waitSec > env.AVG_JOB_DURATION_SECONDS) {
      await downloadMessageEditor.editMessage(
        ctx.i18n.t('status_queued_wait', { minutes: String(Math.ceil(waitSec / 60)) })
      )
    } else {
      await downloadMessageEditor.editMessage(ctx.i18n.t('status_queued'))
    }

    await ctx.replyWithChatAction(
      ctx.dbchat.audio ? 'upload_voice' : 'upload_video'
    )

    const { doc: downloadJob, created } = await findOrCreateDownloadJob(
      checkedUrl,
      ctx.dbchat.audio,
      ctx.dbchat.telegramId,
      statusMsg.message_id
    )
    await findOrCreateDownloadRequest(
      ctx.dbchat.telegramId,
      statusMsg.message_id,
      downloadJob
    )

    if (created) {
      await downloadMessageEditor.editMessage(ctx.i18n.t('status_downloading'))
      downloadJob.status = DownloadJobStatus.downloading
      await downloadJob.save()
    } else {
      await downloadMessageEditor.editMessage(ctx.i18n.t('status_queued'))
    }
  } catch (error) {
    if (isValidationError(error)) {
      logger.info('request rejected', {
        code: error.code,
        url,
        chatId: ctx.dbchat.telegramId,
      })
      await downloadMessageEditor.editMessage(validationMessage(ctx, error))
      return
    }
    recordDownloadFailure(ctx.dbchat.telegramId)
    report(error, {
      ctx,
      location: 'createDownloadJobAndRequest',
      meta: JSON.stringify({ url }),
    })
    try {
      await downloadMessageEditor.editMessage(
        ctx.i18n.t('error_cache_or_download_job')
      )
    } catch (editError) {
      report(editError, {
        ctx,
        location: 'createDownloadJobAndRequest error reply',
      })
    }
  }
}
