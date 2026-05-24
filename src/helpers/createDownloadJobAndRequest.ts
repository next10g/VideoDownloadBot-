import env from '@/helpers/env'
import {
  findOrCreateDownloadJob,
  type DownloadJobOptions,
} from '@/models/downloadJobFunctions'
import { DownloadMode } from '@/models/DownloadMode'
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
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { isFacebookShareLink } from '@/services/facebookShareProbe'
import {
  isOnYoutubeCooldown,
  touchYoutubeCooldown,
  youtubeCooldownRemainingSeconds,
} from '@/helpers/youtubeCooldown'
import { recordDownloadFailure } from '@/helpers/userAbuse'

export interface DownloadRequestOptions extends DownloadJobOptions {
  downloadMode: DownloadMode
  maxHeight: number
}

export default async function createDownloadJobAndRequest(
  ctx: Context,
  rawUrl: string,
  requestOpts: DownloadRequestOptions
) {
  const url = normalizeUrl(rawUrl)
  const audio =
    requestOpts.audio || requestOpts.downloadMode === DownloadMode.audio
  ctx.dbchat.lastUrl = url
  ctx.dbchat.pendingUrl = undefined
  ctx.dbchat.pendingTitle = undefined
  ctx.dbchat.pendingMediaProbe = undefined
  await ctx.dbchat.save()

  if (isOnCooldown(ctx.dbchat.telegramId)) {
    const seconds = cooldownRemainingSeconds(ctx.dbchat.telegramId)
    return ctx.reply(
      ctx.i18n.t('error_cooldown', { seconds: String(seconds) })
    )
  }

  if (isYoutubeUrl(url) && isOnYoutubeCooldown(ctx.dbchat.telegramId)) {
    const seconds = youtubeCooldownRemainingSeconds(ctx.dbchat.telegramId)
    return ctx.reply(
      ctx.i18n.t('error_youtube_cooldown', { seconds: String(seconds) })
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
    await assertUserJobLimits(ctx.dbchat.telegramId, checkedUrl, audio)
    const skipProbe =
      Boolean(requestOpts.directStreamUrl) ||
      (requestOpts.downloadMode === DownloadMode.image &&
        isFacebookUrl(checkedUrl) &&
        isFacebookShareLink(checkedUrl))
    if (!env.SKIP_YTDLP_PROBE && !skipProbe) {
      try {
        await probeUrlMetadata(checkedUrl)
      } catch (probeError) {
        if (env.SOFT_YTDLP_PROBE && isValidationError(probeError)) {
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
        {
          url: checkedUrl,
          audio,
          downloadMode: requestOpts.downloadMode,
          maxHeight: requestOpts.maxHeight,
        },
        ctx,
        downloadMessageEditor
      )
      if (cached) {
        touchCooldown(ctx.dbchat.telegramId)
        if (isYoutubeUrl(checkedUrl)) {
          touchYoutubeCooldown(ctx.dbchat.telegramId)
        }
        return
      }
    } catch (error) {
      throw augmentError(error, 'check cache and send file')
    }

    touchCooldown(ctx.dbchat.telegramId)
    if (isYoutubeUrl(checkedUrl)) {
      touchYoutubeCooldown(ctx.dbchat.telegramId)
    }

    const waitSec = downloadQueue.getEstimatedWaitSeconds()
    if (waitSec > env.AVG_JOB_DURATION_SECONDS) {
      await downloadMessageEditor.editMessage(
        ctx.i18n.t('status_queued_wait', { minutes: String(Math.ceil(waitSec / 60)) })
      )
    } else {
      await downloadMessageEditor.editMessage(ctx.i18n.t('status_queued'))
    }

    const uploadAction =
      requestOpts.downloadMode === DownloadMode.audio
        ? 'upload_voice'
        : requestOpts.downloadMode === DownloadMode.image
          ? 'upload_photo'
          : 'upload_video'
    await ctx.replyWithChatAction(uploadAction)

    const { doc: downloadJob, created } = await findOrCreateDownloadJob(
      checkedUrl,
      {
        audio,
        downloadMode: requestOpts.downloadMode,
        maxHeight: requestOpts.maxHeight,
        directStreamUrl: requestOpts.directStreamUrl,
      },
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
    } else if (downloadJob.status === DownloadJobStatus.downloading) {
      await downloadMessageEditor.editMessage(ctx.i18n.t('status_downloading'))
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
