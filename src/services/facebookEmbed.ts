import { createFetchAgent } from '@/helpers/loadUndici'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/services/urlNormalize'
import { resolveFacebookUrl } from '@/services/resolveFacebookUrl'
import { downloadStreamToFile } from '@/services/youtubeStreamDownload'

const FB_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

export interface FacebookStream {
  url: string
  height: number
  label: string
}

export interface FacebookEmbedResult {
  pageUrl: string
  title?: string
  description?: string
  streams: FacebookStream[]
  imageUrl?: string
}

function unescapeJsonUrl(raw: string): string {
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
}

function uniqueStreams(streams: FacebookStream[]): FacebookStream[] {
  const seen = new Set<string>()
  const out: FacebookStream[] = []
  for (const s of streams) {
    if (!s.url.startsWith('http') || seen.has(s.url)) {
      continue
    }
    seen.add(s.url)
    out.push(s)
  }
  out.sort((a, b) => b.height - a.height)
  return out
}

function parseStreamsFromHtml(html: string): FacebookStream[] {
  const streams: FacebookStream[] = []

  const hd =
    html.match(/"hd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/hd_src&quot;:&quot;([^&]+)&quot;/i)?.[1]
  if (hd) {
    const url = unescapeJsonUrl(hd)
    streams.push({ url, height: 720, label: '720p' })
  }

  const sd =
    html.match(/"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/sd_src&quot;:&quot;([^&]+)&quot;/i)?.[1]
  if (sd) {
    const url = unescapeJsonUrl(sd)
    streams.push({ url, height: 480, label: '480p' })
  }

  const playable = html.matchAll(
    /"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/gi
  )
  for (const match of playable) {
    const url = unescapeJsonUrl(match[1])
    streams.push({ url, height: 360, label: '360p' })
  }

  const ogVideo = html.match(
    /property=["']og:video(?::url)?["']\s+content=["']([^"']+)["']/i
  )?.[1]
  if (ogVideo?.startsWith('http')) {
    streams.push({ url: ogVideo, height: 360, label: 'video' })
  }

  return uniqueStreams(streams)
}

function parseImageFromHtml(html: string): string | undefined {
  const ogImage = html.match(
    /property=["']og:image["']\s+content=["']([^"']+)["']/i
  )?.[1]
  if (ogImage?.startsWith('http') && !ogImage.includes('emoji')) {
    return ogImage
  }
  return undefined
}

function parseTitleFromHtml(html: string): string | undefined {
  return (
    html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  )
}

function parseDescriptionFromHtml(html: string): string | undefined {
  return html.match(
    /property=["']og:description["']\s+content=["']([^"']+)["']/i
  )?.[1]
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const response = await fetch(url, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'User-Agent': FB_UA,
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    } as RequestInit)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Cookie-less Facebook: embed plugin + mobile page HTML parsing. */
export async function probeFacebookEmbed(
  rawUrl: string,
  timeoutMs = 30_000
): Promise<FacebookEmbedResult | null> {
  const pageUrl = await resolveFacebookUrl(rawUrl)
  const targets = [
    `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(pageUrl)}&show_text=false&width=1280`,
    `https://m.facebook.com${new URL(pageUrl).pathname}${new URL(pageUrl).search}`,
    pageUrl.replace('www.facebook.com', 'mbasic.facebook.com'),
    pageUrl,
  ]

  let best: FacebookEmbedResult | null = null

  for (const target of targets) {
    try {
      const html = await fetchHtml(target, timeoutMs)
      const streams = parseStreamsFromHtml(html)
      const imageUrl = parseImageFromHtml(html)
      const title = parseTitleFromHtml(html)
      const description = parseDescriptionFromHtml(html)

      if (streams.length === 0 && !imageUrl) {
        continue
      }

      const result: FacebookEmbedResult = {
        pageUrl,
        title,
        description,
        streams,
        imageUrl,
      }

      if (streams.length > 0) {
        logger.info('facebook embed probe ok', {
          target,
          streams: streams.length,
          heights: streams.map((s) => s.height),
        })
        return result
      }

      if (!best && imageUrl) {
        best = result
      }
    } catch (error) {
      logger.warn('facebook embed fetch failed', {
        target,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (best) {
    logger.info('facebook embed image-only', { pageUrl })
    return best
  }

  return null
}

export function pickFacebookStream(
  result: FacebookEmbedResult,
  maxHeight: number
): FacebookStream | undefined {
  if (result.streams.length === 0) {
    return undefined
  }
  const sorted = [...result.streams].sort((a, b) => b.height - a.height)
  const fit = sorted.find((s) => s.height <= maxHeight)
  return fit ?? sorted[sorted.length - 1]
}

export async function downloadFacebookDirect(
  streamUrl: string,
  destPath: string,
  timeoutMs: number
): Promise<void> {
  await downloadStreamToFile(
    streamUrl,
    destPath,
    timeoutMs,
    'https://www.facebook.com/'
  )
}

export function facebookPageUrl(url: string): string {
  return isFacebookUrl(url) ? normalizeUrl(url) : url
}
