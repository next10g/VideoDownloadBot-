import env from '@/helpers/env'
import { buildFormatKeyboardFromProbe } from '@/helpers/formatKeyboard'
import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { logSubmittedLink } from '@/helpers/logUserLink'
import { loadProbe, storeProbe } from '@/helpers/pendingMediaProbe'
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
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { igPhotosEnabled } from '@/helpers/instagramMediaPolicy'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { isGenericFileUrl } from '@/helpers/isGenericFileUrl'
import { saveDbChat } from '@/helpers/saveDbChat'
import { ytdlpErrorI18nKey } from '@/helpers/ytdlpUserMessage'

export default async function offerDownloadFormats(ctx: Context, rawUrl: string) {
  const url = normalizeUrl(rawUrl)
  const preference = getDownloadPreference(ctx.dbchat)
  ctx.dbchat.lastUrl = url
  ctx.dbchat.pendingUrl = url

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

  if (env.YOUTUBE_DISABLED && isYoutubeUrl(url)) {
    return ctx.reply(ctx.i18n.t('error_youtube_disabled'))
  }

  if (
    preference === 'image' &&
    !isInstagramUrl(url) &&
    !isFacebookUrl(url)
  ) {
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

    const jobUrl = offer.downloadUrl || checkedUrl

    if (offer.isFile || isGenericFileUrl(checkedUrl)) {
      return createDownloadJobAndRequest(ctx, jobUrl, {
        downloadMode: DownloadMode.file,
        maxHeight: 0,
        audio: false,
      })
    }

    const isReel = /\/(reel|tv)\//i.test(checkedUrl)

    const wantCarousel =
      !isReel &&
      offer.videoHeights.length === 0 &&
      (preference === 'carousel' ||
        (preference === 'auto' &&
          (offer.hasAlbum || offer.albumUrls.length > 1))) &&
      (isFacebookUrl(checkedUrl) ||
        (isInstagramUrl(checkedUrl) && igPhotosEnabled()))

    if (wantCarousel && offer.albumUrls.length > 0) {
      return createDownloadJobAndRequest(ctx, jobUrl, {
        downloadMode: DownloadMode.album,
        maxHeight: 0,
        audio: false,
        albumUrls: offer.albumUrls,
      })
    }

    if (preference === 'carousel') {
      if (offer.albumUrls.length === 1) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: 0,
          audio: false,
          albumUrls: offer.albumUrls,
        })
      }
      await editor.editMessage(ctx.i18n.t('error_no_carousel'))
      return
    }

    if (preference === 'image') {
      if (offer.albumUrls.length > 1 || offer.hasAlbum) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.album,
          maxHeight: 0,
          audio: false,
          albumUrls: offer.albumUrls,
        })
      }
      if (offer.albumUrls.length === 1) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: 0,
          audio: false,
          albumUrls: offer.albumUrls,
        })
      }
      if (offer.hasImage || offer.videoHeights.length === 0) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: offer.imageSizes[0] ?? 0,
          audio: false,
        })
      }
      await editor.editMessage(ctx.i18n.t('error_no_image'))
      return
    }

    if (preference === 'audio') {
      if (offer.hasAudio || offer.videoHeights.length > 0) {
        const ext = offer.audioExts[0]
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.audio,
          maxHeight: 0,
          preferredExt: ext,
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
          maxHeight: offer.imageSizes[0] ?? 0,
          audio: false,
        })
      }
      await editor.editMessage(ctx.i18n.t('error_no_video'))
      return
    }

    if (!env.SHOW_FORMAT_MENU && preference === 'auto') {
      if (offer.videoHeights.length > 0 || isReel) {
        const defaultHeight = offer.videoHeights[0] ?? 720
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.video,
          maxHeight: defaultHeight,
          audio: false,
        })
      }
      if (
        offer.albumUrls.length > 0 &&
        (offer.hasAlbum || offer.albumUrls.length > 1)
      ) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.album,
          maxHeight: 0,
          audio: false,
          albumUrls: offer.albumUrls,
        })
      }
      if (offer.albumUrls.length === 1) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: 0,
          audio: false,
          albumUrls: offer.albumUrls,
        })
      }
      if (offer.hasImage || offer.albumUrls.length === 1) {
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.image,
          maxHeight: offer.imageSizes[0] ?? 0,
          audio: false,
          albumUrls: offer.albumUrls.length ? offer.albumUrls : undefined,
        })
      }
      const fbStream = offer.facebook
        ? pickFacebookStream(offer.facebook, 720)
        : undefined
      return createDownloadJobAndRequest(ctx, jobUrl, {
        downloadMode: DownloadMode.video,
        maxHeight: 720,
        audio: false,
        directStreamUrl: fbStream?.url,
      })
    }

    ctx.dbchat.pendingUrl = jobUrl
    ctx.dbchat.pendingTitle = offer.title
    ctx.dbchat.pendingMediaProbe = storeProbe(offer)
    await saveDbChat(ctx.dbchat)

    const stored = loadProbe(ctx.dbchat.pendingMediaProbe)!

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
    const detail = error instanceof Error ? error.message : String(error)
    if (isFacebookUrl(url) || (isInstagramUrl(url) && igPhotosEnabled())) {
      try {
        const { probeSocialImageUrls } = await import('@/helpers/socialCarousel')
        const albumUrls = await probeSocialImageUrls(url)
        if (albumUrls.length > 0) {
          const mode =
            albumUrls.length > 1 ? DownloadMode.album : DownloadMode.image
          return createDownloadJobAndRequest(ctx, rawUrl, {
            downloadMode: mode,
            maxHeight: 0,
            audio: false,
            albumUrls,
          })
        }
      } catch {
        // fall through
      }
    }
    if (
      detail.includes('Unsupported URL') ||
      (isValidationError(error) &&
        (error.code === 'unsupported' || error.code === 'probe_failed'))
    ) {
      const { probeGenericPage } = await import('@/services/genericPageMedia')
      const generic = await probeGenericPage(url)
      if (generic) {
        const jobUrl = generic.downloadUrl || url
        if (generic.isFile || isGenericFileUrl(url)) {
          return createDownloadJobAndRequest(ctx, jobUrl, {
            downloadMode: DownloadMode.file,
            maxHeight: 0,
            audio: false,
          })
        }
        if (generic.hasAlbum && generic.albumUrls.length > 1) {
          return createDownloadJobAndRequest(ctx, jobUrl, {
            downloadMode: DownloadMode.album,
            maxHeight: 0,
            audio: false,
            albumUrls: generic.albumUrls,
          })
        }
        if (generic.hasImage && generic.videoHeights.length === 0) {
          return createDownloadJobAndRequest(ctx, jobUrl, {
            downloadMode: DownloadMode.image,
            maxHeight: 0,
            audio: false,
            albumUrls: generic.albumUrls,
          })
        }
        return createDownloadJobAndRequest(ctx, jobUrl, {
          downloadMode: DownloadMode.video,
          maxHeight: 1080,
          audio: false,
        })
      }
    }
    const ytdlpKey = ytdlpErrorI18nKey(detail)
    if (ytdlpKey) {
      await editor.editMessage(ctx.i18n.t(ytdlpKey))
      return
    }
    report(error, { ctx, location: 'offerDownloadFormats' })
    await editor.editMessage(ctx.i18n.t('error_cache_or_download_job'))
  }
}
