import { createFetchAgent } from '@/helpers/loadUndici'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/services/urlNormalize'
import {
  facebookFetchHeaders,
  facebookUrlCandidatesFromId,
  resolveFacebookUrl,
} from '@/services/resolveFacebookUrl'
import { downloadStreamToFile } from '@/services/youtubeStreamDownload'

export interface FacebookStream {
  url: string
  height: number
  label: string
}

export interface FacebookEmbedResult {
  pageUrl: string
  resolvedUrl?: string
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
    html.match(/hd_src&quot;:&quot;([^&]+)&quot;/i)?.[1] ||
    html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/i)?.[1]
  if (hd) {
    streams.push({ url: unescapeJsonUrl(hd), height: 1080, label: '1080p' })
  }

  const sd =
    html.match(/"sd_src(?:_no_ratelimit)?"\s*:\s*"([^"]+)"/i)?.[1] ||
    html.match(/sd_src&quot;:&quot;([^&]+)&quot;/i)?.[1] ||
    html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/i)?.[1]
  if (sd) {
    streams.push({ url: unescapeJsonUrl(sd), height: 480, label: '480p' })
  }

  const playable = html.matchAll(
    /"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/gi
  )
  for (const match of playable) {
    const url = unescapeJsonUrl(match[1])
    streams.push({ url, height: 360, label: '360p' })
  }

  const dash = html.matchAll(/"base_url"\s*:\s*"([^"]+)"/gi)
  for (const match of dash) {
    const url = unescapeJsonUrl(match[1])
    if (url.includes('video') || url.includes('.mp4')) {
      streams.push({ url, height: 720, label: '720p' })
    }
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

  const scontent = html.match(
    /https:\/\/scontent[^"'\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/i
  )?.[0]
  if (scontent && !scontent.includes('emoji')) {
    return unescapeJsonUrl(scontent)
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

function mergeResult(
  base: FacebookEmbedResult | null,
  patch: Partial<FacebookEmbedResult>
): FacebookEmbedResult {
  return {
    pageUrl: patch.pageUrl || base?.pageUrl || '',
    resolvedUrl: patch.resolvedUrl || base?.resolvedUrl,
    title: patch.title || base?.title,
    description: patch.description || base?.description,
    streams: uniqueStreams([...(base?.streams || []), ...(patch.streams || [])]),
    imageUrl: patch.imageUrl || base?.imageUrl,
  }
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const response = await fetch(url, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: facebookFetchHeaders(true),
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

async function probeOembedJson(
  rawUrl: string,
  timeoutMs: number
): Promise<FacebookEmbedResult | null> {
  const endpoints = [
    'https://www.facebook.com/plugins/post/oembed.json',
    'https://www.facebook.com/plugins/video/oembed.json',
  ]
  for (const base of endpoints) {
    try {
      const url = `${base}/?url=${encodeURIComponent(rawUrl)}&format=json`
      const body = await fetchHtml(url, timeoutMs)
      const data = JSON.parse(body) as {
        title?: string
        author_name?: string
        html?: string
        url?: string
      }
      if (!data.html) {
        continue
      }
      const streams = parseStreamsFromHtml(data.html)
      const imageUrl = parseImageFromHtml(data.html)
      if (streams.length === 0 && !imageUrl) {
        continue
      }
      return {
        pageUrl: rawUrl,
        resolvedUrl: data.url ? normalizeUrl(data.url) : undefined,
        title: data.title || data.author_name,
        streams,
        imageUrl,
      }
    } catch (error) {
      logger.warn('facebook oembed failed', {
        base,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return null
}

function buildEmbedTargets(rawUrl: string, resolvedUrl: string): string[] {
  const targets: string[] = [
    `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(rawUrl)}&show_text=false&width=1280`,
  ]
  if (resolvedUrl !== rawUrl) {
    targets.push(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(resolvedUrl)}&show_text=false&width=1280`
    )
  }

  if (!/\/share\//i.test(resolvedUrl)) {
    try {
      const parsed = new URL(resolvedUrl)
      targets.push(
        `https://m.facebook.com${parsed.pathname}${parsed.search}`,
        resolvedUrl.replace('www.facebook.com', 'mbasic.facebook.com'),
        resolvedUrl
      )
    } catch {
      targets.push(resolvedUrl)
    }
  }

  return [...new Set(targets)]
}

/** Cookie-less Facebook: oEmbed + embed plugin + mobile HTML parsing. */
export async function probeFacebookEmbed(
  rawUrl: string,
  timeoutMs = 30_000
): Promise<FacebookEmbedResult | null> {
  const resolvedUrl = await resolveFacebookUrl(rawUrl)
  let best: FacebookEmbedResult | null = null

  const oembed = await probeOembedJson(rawUrl, timeoutMs)
  if (oembed) {
    best = mergeResult(best, { ...oembed, pageUrl: rawUrl, resolvedUrl })
    if (best.streams.length > 0) {
      logger.info('facebook oembed probe ok', {
        streams: best.streams.length,
        resolvedUrl,
      })
      return best
    }
  }

  if (resolvedUrl !== rawUrl) {
    const oembedResolved = await probeOembedJson(resolvedUrl, timeoutMs)
    if (oembedResolved) {
      best = mergeResult(best, {
        ...oembedResolved,
        pageUrl: rawUrl,
        resolvedUrl,
      })
      if (best.streams.length > 0) {
        logger.info('facebook oembed probe ok (resolved)', { resolvedUrl })
        return best
      }
    }
  }

  const targets = buildEmbedTargets(rawUrl, resolvedUrl)

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

      const patch: FacebookEmbedResult = {
        pageUrl: rawUrl,
        resolvedUrl,
        title,
        description,
        streams,
        imageUrl,
      }
      best = mergeResult(best, patch)

      if (streams.length > 0) {
        logger.info('facebook embed probe ok', {
          target,
          streams: streams.length,
          heights: streams.map((s) => s.height),
          resolvedUrl,
        })
        return best
      }
    } catch (error) {
      logger.warn('facebook embed fetch failed', {
        target,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (best?.imageUrl || (best && best.streams.length > 0)) {
    logger.info('facebook embed partial', {
      pageUrl: rawUrl,
      resolvedUrl,
      streams: best.streams.length,
      hasImage: Boolean(best.imageUrl),
    })
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

/** Re-probe a permalink built from yt-dlp numeric id (share links). */
export async function probeFacebookByContentId(
  contentId: string,
  rawUrl: string,
  timeoutMs: number
): Promise<FacebookEmbedResult | null> {
  for (const candidate of facebookUrlCandidatesFromId(contentId)) {
    const result = await probeFacebookEmbed(candidate, timeoutMs)
    if (result && (result.streams.length > 0 || result.imageUrl)) {
      return { ...result, pageUrl: rawUrl, resolvedUrl: candidate }
    }
  }
  return null
}
