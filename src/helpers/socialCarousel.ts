import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import { scrapeAllInstagramImages } from '@/helpers/instagramScrape'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import logger from '@/lib/logger'
import { extractAlbumImageUrls } from '@/services/albumExtract'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import env from '@/helpers/env'

export function isSocialCarouselUrl(url: string): boolean {
  return isInstagramUrl(url) || isFacebookUrl(url)
}

/** Instagram/Facebook carousels arrive as yt-dlp playlists — not YouTube playlists. */
export function isSocialCarouselMeta(
  meta: YtDlpMetadata,
  url?: string
): boolean {
  if (url && !isSocialCarouselUrl(url)) {
    return false
  }
  const entries = meta.entries
  if (entries && entries.length > 1) {
    return true
  }
  return extractAlbumImageUrls(meta).length > 1
}

function probeTimeoutMs(url: string): number {
  if (isInstagramUrl(url) || isFacebookUrl(url)) {
    return Math.min(env.YTDLP_PROBE_TIMEOUT_MS, 45_000)
  }
  return env.YTDLP_PROBE_TIMEOUT_MS
}

/** @deprecated Use scrapeAllInstagramImages */
export async function scrapeInstagramEmbedImages(
  postUrl: string
): Promise<string[]> {
  return scrapeAllInstagramImages(postUrl)
}

async function probeWithYtdlp(url: string, timeout: number): Promise<string[]> {
  const flags = {
    ...buildProbeFlags(url),
    ignoreNoFormatsError: true,
  }
  const raw = await runYtdlpJson(url, flags, timeout, 'probe')
  return extractAlbumImageUrls(raw)
}

/** Probe IG/FB post and return direct image URLs (carousel or single photo). */
export async function probeSocialImageUrls(url: string): Promise<string[]> {
  const timeout = probeTimeoutMs(url)

  if (isInstagramUrl(url)) {
    const scraped = await scrapeAllInstagramImages(url)
    if (scraped.length > 0) {
      return scraped
    }
  }

  try {
    const urls = filterSocialImageUrls(
      await probeWithYtdlp(url, timeout),
      url
    )
    if (urls.length > 0) {
      return urls
    }
  } catch (error) {
    logger.warn('social ytdlp probe failed', {
      url,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  if (isInstagramUrl(url)) {
    return scrapeAllInstagramImages(url)
  }

  return []
}
