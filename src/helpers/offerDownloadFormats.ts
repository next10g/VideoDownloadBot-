import env from '@/helpers/env'
import { buildFormatKeyboard } from '@/helpers/formatKeyboard'
import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { logSubmittedLink } from '@/helpers/logUserLink'
import MessageEditor from '@/helpers/MessageEditor'
import { DownloadMode } from '@/models/DownloadMode'
import Context from '@/models/Context'
import { preflightUrl } from '@/services/urlPreflight'
import { normalizeUrl } from '@/services/urlNormalize'
import { probeUrlMetadata } from '@/services/ytdlpProbe'
import { isValidationError } from '@/lib/errors'
import logger from '@/lib/logger'
import report from '@/helpers/report'
import {
  blockedUserMessage,
  isBlockedUser,
  validationMessage,
} from '@/helpers/validationMessages'
import {
  cooldownRemainingSeconds,
  isOnCooldown,
} from '@/helpers/cooldown'
import {
  isOnYoutubeCooldown,
  youtubeCooldownRemainingSeconds,
} from '@/helpers/youtubeCooldown'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'

export default async function offerDownloadFormats(ctx: Context, rawUrl: string) {
  const url = normalizeUrl(rawUrl)
  ctx.dbchat.lastUrl = url
  ctx.dbchat.pendingUrl = url
  await ctx.dbchat.save()

  if (isOnCooldown(ctx.dbchat.telegramId)) {
    const seconds = cooldownRemainingSeconds(ctx.dbchat.telegramId)
    return ctx.reply(ctx.i18n.t('error_cooldown', { seconds: String(seconds) }))
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

  const statusMsg = await ctx.reply(ctx.i18n.t('status_validating'))
  const editor = new MessageEditor(statusMsg.message_id, ctx)

  try {
    const checkedUrl = await preflightUrl(url)
    let title = ''
    if (!env.SKIP_YTDLP_PROBE) {
      try {
        const meta = await probeUrlMetadata(checkedUrl)
        title = meta.title || ''
      } catch (probeError) {
        if (!env.SOFT_YTDLP_PROBE || !isValidationError(probeError)) {
          throw probeError
        }
        logger.warn('soft probe for format menu', {
          url: checkedUrl,
          detail:
            probeError instanceof Error ? probeError.message : String(probeError),
        })
      }
    }

    await logSubmittedLink(ctx, checkedUrl, { title })

    if (!env.SHOW_FORMAT_MENU) {
      return createDownloadJobAndRequest(ctx, checkedUrl, {
        downloadMode: ctx.dbchat.audio ? DownloadMode.audio : DownloadMode.video,
        maxHeight: 720,
        audio: ctx.dbchat.audio,
      })
    }

    ctx.dbchat.pendingUrl = checkedUrl
    ctx.dbchat.pendingTitle = title
    await ctx.dbchat.save()

    const prompt = title
      ? ctx.i18n.t('format_choose_with_title', {
          title: title.slice(0, 80),
        })
      : ctx.i18n.t('format_choose')

    await editor.editMessage(prompt, buildFormatKeyboard(ctx))
  } catch (error) {
    if (isValidationError(error)) {
      await editor.editMessage(validationMessage(ctx, error))
      return
    }
    report(error, { ctx, location: 'offerDownloadFormats' })
    await editor.editMessage(ctx.i18n.t('error_cache_or_download_job'))
  }
}
