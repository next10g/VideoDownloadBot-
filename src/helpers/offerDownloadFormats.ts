import env from '@/helpers/env'
import { buildFormatKeyboardFromProbe } from '@/helpers/formatKeyboard'
import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { logSubmittedLink } from '@/helpers/logUserLink'
import { storeProbe } from '@/helpers/pendingMediaProbe'
import MessageEditor from '@/helpers/MessageEditor'
import { DownloadMode } from '@/models/DownloadMode'
import Context from '@/models/Context'
import { preflightUrl } from '@/services/urlPreflight'
import { normalizeUrl } from '@/services/urlNormalize'
import { probeMediaOffer } from '@/services/mediaProbe'
import { pickFacebookStream } from '@/services/facebookEmbed'
import { isValidationError } from '@/lib/errors'
import report from '@/helpers/report'
import { getDownloadPreference } from '@/helpers/downloadPreference'
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
  const preference = getDownloadPreference(ctx.dbchat)
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

  if (preference === 'image') {
    return createDownloadJobAndRequest(ctx, rawUrl, {
      downloadMode: DownloadMode.image,
      maxHeight: 0,
      audio: false,
    })
  }

  const statusMsg = await ctx.reply(ctx.i18n.t('status_validating'))
  const editor = new MessageEditor(statusMsg.message_id, ctx)

  try {
    const checkedUrl = await preflightUrl(url)
    const offer = await probeMediaOffer(checkedUrl)

    await logSubmittedLink(ctx, checkedUrl, { title: offer.title })

    const stored = {
      title: offer.title,
      description: offer.description,
      videoHeights: offer.videoHeights,
      hasImage: offer.hasImage,
      hasAudio: offer.hasAudio,
      facebook: offer.facebook,
    }

    const jobUrl = offer.downloadUrl || checkedUrl

    if (preference === 'audio') {
      if (offer.hasAudio || offer.videoHeights.length > 0) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.audio,
          maxHeight: 0,
          audio: true,
        })
      }
      await editor.editMessage(ctx.i18n.t('error_no_audio'))
      return
    }

    if (preference === 'video' && offer.videoHeights.length === 0) {
      if (offer.hasImage) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: 0,
          audio: false,
        })
      }
      await editor.editMessage(ctx.i18n.t('error_no_video'))
      return
    }

    if (!env.SHOW_FORMAT_MENU && preference === 'auto') {
      const defaultHeight = offer.videoHeights[0] ?? 720
      const fbStream = offer.facebook
        ? pickFacebookStream(offer.facebook, defaultHeight)
        : undefined
      const mode =
        offer.videoHeights.length === 0 && offer.hasImage
          ? DownloadMode.image
          : DownloadMode.video
      return createDownloadJobAndRequest(ctx, jobUrl, {
        downloadMode: mode,
        maxHeight: defaultHeight,
        audio: false,
        directStreamUrl: fbStream?.url,
      })
    }

    ctx.dbchat.pendingUrl = jobUrl
    ctx.dbchat.pendingTitle = offer.title
    ctx.dbchat.pendingMediaProbe = storeProbe(offer)
    await ctx.dbchat.save()

    let promptKey = 'format_choose_auto'
    if (offer.videoHeights.length === 0 && offer.hasImage) {
      promptKey = 'format_image_only'
    } else if (offer.videoHeights.length > 0 && !offer.hasImage) {
      promptKey = 'format_video_only'
    } else if (offer.videoHeights.length > 0 && offer.hasImage) {
      promptKey = 'format_mixed'
    }

    const prompt = offer.title
      ? ctx.i18n.t('format_choose_with_title', {
          title: offer.title.slice(0, 80),
        })
      : ctx.i18n.t(promptKey)

    await editor.editMessage(prompt, buildFormatKeyboardFromProbe(ctx, stored))
  } catch (error) {
    if (isValidationError(error)) {
      await editor.editMessage(validationMessage(ctx, error))
      return
    }
    report(error, { ctx, location: 'offerDownloadFormats' })
    await editor.editMessage(ctx.i18n.t('error_cache_or_download_job'))
  }
}
