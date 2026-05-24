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

import { extractAlbumImageUrls } from '@/services/albumExtract'
import { mergeFormatHints, parseYtdlpFormats } from '@/services/formatExtract'
import { isGenericFileUrl } from '@/helpers/isGenericFileUrl'

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

  albumUrls: string[]

  hasAlbum: boolean

  isFile: boolean

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

    albumUrls: [],

    hasAlbum: false,

    isFile: false,

  }

}



function offerFromYtdlp(meta: YtDlpMetadata, downloadUrl?: string): MediaFormatOffer {

  const formats = (meta as YtDlpMetadata & { formats?: Record<string, unknown>[] })

    .formats

  const parsed = mergeFormatHints(parseYtdlpFormats(formats), meta)
  const albumUrls = extractAlbumImageUrls(meta)

  return {

    title: meta.title || 'Video',

    description: meta.description,

    videoHeights: parsed.videoHeights,

    imageSizes: parsed.imageSizes,

    audioExts: parsed.audioExts,

    hasImage: parsed.hasImage,

    hasAudio: parsed.hasAudio,

    downloadUrl,

    albumUrls,

    hasAlbum: albumUrls.length > 1 || Boolean(meta.entries && meta.entries.length > 1),

    isFile: downloadUrl ? isGenericFileUrl(downloadUrl) : false,

  }

}



function probeTimeoutMs(url: string): number {
  if (isInstagramUrl(url) || isFacebookUrl(url)) {
    return Math.min(env.YTDLP_PROBE_TIMEOUT_MS, 35_000)
  }
  return env.YTDLP_PROBE_TIMEOUT_MS
}

async function probeYtdlp(url: string): Promise<MediaFormatOffer> {
  const timeout = probeTimeoutMs(url)
  let meta: YtDlpMetadata
  try {
    meta = (await runYtdlpJson(
      url,
      buildProbeFlags(url),
      timeout,
      'probe'
    )) as YtDlpMetadata
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error)
    if (
      isInstagramUrl(url) &&
      detail.toLowerCase().includes('no video in this post')
    ) {
      const { probeSocialImageUrls } = await import('@/helpers/socialCarousel')
      const albumUrls = await probeSocialImageUrls(url)
      if (albumUrls.length > 0) {
        return {
          title: 'Instagram',
          videoHeights: [],
          imageSizes: [1080],
          audioExts: [],
          hasImage: true,
          hasAudio: false,
          downloadUrl: url,
          albumUrls,
          hasAlbum: albumUrls.length > 1,
          isFile: false,
        }
      }
    }
    throw error
  }

  const albumUrls = extractAlbumImageUrls(meta)

  if (albumUrls.length > 1 || (meta.entries && meta.entries.length > 1)) {
    return offerFromYtdlp(meta, url)
  }

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

          albumUrls: [],

          hasAlbum: false,

          isFile: false,

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

