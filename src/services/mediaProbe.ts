import env from '@/helpers/env'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import logger from '@/lib/logger'
import { ValidationError } from '@/lib/errors'
import {
  probeFacebookByContentId,
  probeFacebookEmbed,
  probeFacebookShareFallback,
  type FacebookEmbedResult,
} from '@/services/facebookEmbed'
import { isFacebookShareLink } from '@/services/facebookShareProbe'
import {
  parseFacebookLinkMeta,
  sanitizeFacebookUrl,
} from '@/services/facebookLinkMeta'
import {
  facebookIdFromYtdlpError,
  resolveFacebookUrl,
} from '@/services/resolveFacebookUrl'
import { mergeFormatHints, parseYtdlpFormats } from '@/services/formatExtract'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { formatYtdlpError, runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

/** Facebook embed scrape budget (keep under Telegram webhook limit). */
const FACEBOOK_PROBE_MS = 18_000

export interface MediaFormatOffer {
  title: string
  description?: string
  videoHeights: number[]
  imageSizes: number[]
  audioExts: string[]
  hasImage: boolean
  hasAudio: boolean
  facebook?: FacebookEmbedResult
  downloadUrl?: string
}

function offerFromFacebook(
  embed: FacebookEmbedResult,
  rawUrl?: string
): MediaFormatOffer {
  const heights = embed.streams.map((s) => s.height).filter((h) => h > 0)
  const unique = [...new Set(heights)].sort((a, b) => b - a)
  return {
    title: embed.title || 'Facebook',
    description: embed.description,
    videoHeights: unique,
    imageSizes: embed.imageUrl ? [1080] : [],
    audioExts: unique.length > 0 ? ['m4a'] : [],
    hasImage: Boolean(embed.imageUrl),
    hasAudio: unique.length > 0,
    facebook: embed,
    downloadUrl: embed.resolvedUrl || rawUrl,
  }
}

function offerFromYtdlp(meta: YtDlpMetadata, downloadUrl?: string): MediaFormatOffer {
  const formats = (meta as YtDlpMetadata & { formats?: Record<string, unknown>[] })
    .formats
  const parsed = mergeFormatHints(parseYtdlpFormats(formats), meta)
  return {
    title: meta.title || 'Video',
    description: meta.description,
    videoHeights: parsed.videoHeights,
    imageSizes: parsed.imageSizes,
    audioExts: parsed.audioExts,
    hasImage: parsed.hasImage,
    hasAudio: parsed.hasAudio,
    downloadUrl,
  }
}

async function probeYtdlp(url: string): Promise<MediaFormatOffer> {
  const raw = await runYtdlpJson(
    url,
    buildProbeFlags(url),
    env.YTDLP_PROBE_TIMEOUT_MS,
    'probe'
  )
  const meta = raw as YtDlpMetadata
  if (meta._type === 'playlist' && meta.entries?.[0]) {
    return offerFromYtdlp(meta.entries[0], url)
  }
  return offerFromYtdlp(meta, url)
}

/** Numeric photo.php / share/p — embed only (yt-dlp never works on Hostinger). */
function isStrictFacebookPhotoOnly(downloadUrl: string, rawUrl: string): boolean {
  return (
    /photo\.php\?fbid=|\/share\/p\//i.test(downloadUrl) ||
    /\/share\/p\//i.test(rawUrl)
  )
}

function isFacebookPhotoOrPost(url: string, downloadUrl: string): boolean {
  if (/\/posts\/pfbid/i.test(url) || /\/posts\/pfbid/i.test(downloadUrl)) {
    return true
  }
  if (isStrictFacebookPhotoOnly(downloadUrl, url)) {
    return true
  }
  const kind = parseFacebookLinkMeta(downloadUrl).kind
  return kind === 'photo' || kind === 'post'
}

/** Probe link and decide which download buttons to show (no cookies). */
export async function probeMediaOffer(url: string): Promise<MediaFormatOffer> {
  if (isFacebookUrl(url)) {
    const embed = await probeFacebookEmbed(url, FACEBOOK_PROBE_MS)
    if (embed && (embed.streams.length > 0 || embed.imageUrl)) {
      return offerFromFacebook(embed, url)
    }

    const downloadUrl = sanitizeFacebookUrl(await resolveFacebookUrl(url), url)
    const photoOrPost = isFacebookPhotoOrPost(url, downloadUrl)
    logger.warn('facebook embed empty', {
      url,
      resolvedUrl: downloadUrl,
      photoOrPost,
      strictPhoto: isStrictFacebookPhotoOnly(downloadUrl, url),
      isShare: isFacebookShareLink(url),
    })

    if (isStrictFacebookPhotoOnly(downloadUrl, url)) {
      if (isFacebookShareLink(url)) {
        const shareRetry = await probeFacebookShareFallback(
          url,
          downloadUrl,
          14_000
        )
        if (shareRetry) {
          logger.info('facebook share fallback ok', { url })
          return offerFromFacebook(shareRetry, url)
        }
        logger.info('facebook share photo menu (soft)', { url, downloadUrl })
        return {
          title: 'Facebook',
          videoHeights: [],
          imageSizes: [],
          audioExts: [],
          hasImage: true,
          hasAudio: false,
          downloadUrl: url,
        }
      }
      throw new ValidationError(
        'Facebook photo could not be loaded from this server (public posts only)',
        'facebook_failed'
      )
    }

    try {
      return await probeYtdlp(downloadUrl)
    } catch (error) {
      const message = formatYtdlpError(error)
      const contentId = facebookIdFromYtdlpError(message)
      if (contentId) {
        const byId = await probeFacebookByContentId(
          contentId,
          url,
          12_000
        )
        if (byId) {
          logger.info('facebook probe ok via content id', { contentId })
          return offerFromFacebook(byId, url)
        }
      }
      throw new ValidationError(
        'Facebook link could not be read from this server (public post/Reel only)',
        'facebook_failed'
      )
    }
  }

  if (isInstagramUrl(url)) {
    logger.info('instagram probe', { url })
  }

  return probeYtdlp(url)
}
