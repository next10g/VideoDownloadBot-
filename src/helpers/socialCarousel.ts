import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import logger from '@/lib/logger'
import { extractAlbumImageUrls } from '@/services/albumExtract'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import env from '@/helpers/env'

const IG_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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

/** Public IG embed page — fallback when yt-dlp returns "no video in this post". */
export async function scrapeInstagramEmbedImages(
  postUrl: string
): Promise<string[]> {
  const base = postUrl.split('?')[0].replace(/\/$/, '')
  const embedUrl = `${base}/embed/captioned/`
  const res = await fetch(embedUrl, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      'User-Agent': IG_UA,
      Accept: 'text/html',
      Referer: 'https://www.instagram.com/',
    },
  })
  if (!res.ok) {
    return []
  }
  const html = await res.text()
  const displayOnly = new Set<string>()
  const displayRe = /"display_url":"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = displayRe.exec(html))) {
    const raw = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/')
    if (raw.startsWith('http')) {
      displayOnly.add(raw)
    }
  }
  if (displayOnly.size > 0) {
    return filterSocialImageUrls([...displayOnly], postUrl)
  }

  const urls = new Set<string>()
  const patterns = [
    /"display_resources":\[[^\]]*"src":"([^"]+)"/g,
    /(https:\/\/[^\s"\\]+\.cdninstagram\.com\/[^\s"\\]+\.(?:jpg|jpeg|webp)[^\s"\\]*)/gi,
  ]
  for (const re of patterns) {
    while ((match = re.exec(html))) {
      const raw = (match[1] || match[0])
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
      if (raw.startsWith('http')) {
        urls.add(raw)
      }
    }
  }
  return filterSocialImageUrls([...urls], postUrl)
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
    try {
      const scraped = await scrapeInstagramEmbedImages(url)
      if (scraped.length > 0) {
        logger.info('instagram embed scrape ok', { url, count: scraped.length })
        return scraped
      }
    } catch (error) {
      logger.warn('instagram embed scrape failed', {
        url,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return []
}
