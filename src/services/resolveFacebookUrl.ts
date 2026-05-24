import { createFetchAgent } from '@/helpers/loadUndici'
import logger from '@/lib/logger'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { normalizeUrl } from '@/services/urlNormalize'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

export function facebookFetchHeaders(mobile = false): Record<string, string> {
  return {
    'User-Agent': mobile ? MOBILE_UA : DESKTOP_UA,
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    Referer: 'https://www.facebook.com/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  }
}

function unescapeFbUrl(raw: string): string {
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
}

function isUsableFacebookUrl(url: string): boolean {
  if (!isFacebookUrl(url)) {
    return false
  }
  if (/\/share\//i.test(url) && !/\/share\/[rvp]\//i.test(url)) {
    return false
  }
  return true
}

function permalinkFromIds(ids: {
  videoId?: string
  storyFbid?: string
  photoId?: string
  postId?: string
  groupId?: string
}): string[] {
  const out: string[] = []
  if (ids.videoId) {
    out.push(`https://www.facebook.com/watch/?v=${ids.videoId}`)
    out.push(`https://www.facebook.com/reel/${ids.videoId}`)
    out.push(`https://www.facebook.com/video.php?v=${ids.videoId}`)
  }
  if (ids.photoId) {
    out.push(`https://www.facebook.com/photo.php?fbid=${ids.photoId}`)
    out.push(`https://www.facebook.com/photo/?fbid=${ids.photoId}`)
  }
  if (ids.storyFbid && ids.postId) {
    out.push(
      `https://www.facebook.com/story.php?story_fbid=${ids.storyFbid}&id=${ids.postId}`
    )
  }
  if (ids.groupId && ids.postId) {
    out.push(
      `https://www.facebook.com/groups/${ids.groupId}/permalink/${ids.postId}`
    )
    out.push(
      `https://www.facebook.com/groups/${ids.groupId}/posts/${ids.postId}`
    )
  }
  return out
}

/** Extract canonical permalinks from Facebook HTML/JSON blobs. */
export function extractFacebookPermalinks(html: string): string[] {
  const found = new Set<string>()

  const push = (raw?: string) => {
    if (!raw) {
      return
    }
    const url = unescapeFbUrl(raw.trim())
    if (isUsableFacebookUrl(url)) {
      found.add(normalizeUrl(url))
    }
  }

  push(
    html.match(/property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1]
  )
  push(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1])
  push(html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1])

  for (const match of html.matchAll(
    /https:\/\/(?:www\.|m\.)?facebook\.com\/[a-zA-Z0-9_./?=&%-]+/gi
  )) {
    push(match[0])
  }

  const videoId =
    html.match(/"video_id"\s*:\s*"(\d{8,})"/i)?.[1] ||
    html.match(/"videoID"\s*:\s*"(\d{8,})"/i)?.[1]
  const storyFbid = html.match(/"story_fbid"\s*:\s*"(\d{8,})"/i)?.[1]
  const photoId =
    html.match(/"photo_id"\s*:\s*"(\d{8,})"/i)?.[1] ||
    html.match(/"image_id"\s*:\s*"(\d{8,})"/i)?.[1]
  const postId =
    html.match(/"post_id"\s*:\s*"(\d{8,})"/i)?.[1] ||
    html.match(/"top_level_post_id"\s*:\s*"(\d{8,})"/i)?.[1]
  const groupId = html.match(/"group_id"\s*:\s*"(\d{8,})"/i)?.[1]
  const pageId = html.match(/"page_id"\s*:\s*"(\d{8,})"/i)?.[1]

  for (const url of permalinkFromIds({
    videoId,
    storyFbid,
    photoId,
    postId: postId || pageId,
    groupId,
  })) {
    push(url)
  }

  const reel =
    html.match(/https:\/\/(?:www\.)?facebook\.com\/reel\/\d+/i)?.[0] ||
    html.match(/"permalink_url"\s*:\s*"([^"]*\/reel\/\d+[^"]*)"/i)?.[1]
  if (reel) {
    push(reel)
  }

  return [...found]
}

export async function fetchFacebookHtml(
  url: string,
  timeoutMs: number,
  mobile = false
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: facebookFetchHeaders(mobile),
    } as RequestInit)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

async function followRedirectChain(
  url: string,
  timeoutMs: number
): Promise<string | undefined> {
  const dispatcher = createFetchAgent(timeoutMs)
  let current = url
  for (let i = 0; i < 12; i++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
        headers: facebookFetchHeaders(i % 2 === 1),
      } as RequestInit)

      const location = response.headers.get('location')
      if (
        location &&
        response.status >= 300 &&
        response.status < 400
      ) {
        current = new URL(location, current).toString()
        if (isUsableFacebookUrl(current)) {
          return normalizeUrl(current)
        }
        continue
      }

      if (response.ok) {
        const finalUrl = response.url || current
        if (isUsableFacebookUrl(finalUrl)) {
          return normalizeUrl(finalUrl)
        }
        const html = await response.text()
        const extracted = extractFacebookPermalinks(html)
        if (extracted.length > 0) {
          return extracted[0]
        }
      }
      return undefined
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }
  return undefined
}

async function resolveViaOembed(url: string, timeoutMs: number): Promise<string | undefined> {
  const endpoints = [
    'https://www.facebook.com/plugins/post/oembed.json',
    'https://www.facebook.com/plugins/video/oembed.json',
  ]
  for (const base of endpoints) {
    try {
      const oembedUrl = `${base}/?url=${encodeURIComponent(url)}&format=json`
      const html = await fetchFacebookHtml(oembedUrl, timeoutMs)
      const data = JSON.parse(html) as { url?: string; html?: string }
      if (data.url && isUsableFacebookUrl(data.url)) {
        return normalizeUrl(data.url)
      }
      if (data.html) {
        const links = extractFacebookPermalinks(data.html)
        if (links.length > 0) {
          return links[0]
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return undefined
}

/** Numeric id from yt-dlp errors: `[facebook] 122263349930253282`. */
export function facebookIdFromYtdlpError(message: string): string | undefined {
  return message.match(/\[facebook\]\s+(\d{8,})/i)?.[1]
}

export function facebookUrlCandidatesFromId(id: string): string[] {
  return permalinkFromIds({ videoId: id, photoId: id, postId: id }).map(
    normalizeUrl
  )
}

/** Expand facebook.com/share/…, fb.watch, groups, photos to a canonical permalink. */
export async function resolveFacebookUrl(url: string): Promise<string> {
  if (!isFacebookUrl(url)) {
    return url
  }

  const normalized = normalizeUrl(url)
  if (isUsableFacebookUrl(normalized) && !/\/share\//i.test(normalized)) {
    return normalized
  }

  const needsResolve =
    /\/share\//i.test(normalized) ||
    normalized.includes('fb.watch') ||
    normalized.includes('fb.com')

  if (!needsResolve) {
    return normalized
  }

  const timeoutMs = 25_000
  const strategies: Array<() => Promise<string | undefined>> = [
    () => followRedirectChain(normalized, timeoutMs),
    () => resolveViaOembed(normalized, timeoutMs),
    async () => {
      try {
        const html = await fetchFacebookHtml(normalized, timeoutMs, true)
        return extractFacebookPermalinks(html)[0]
      } catch {
        return undefined
      }
    },
    async () => {
      try {
        const html = await fetchFacebookHtml(
          normalized.replace('www.facebook.com', 'm.facebook.com'),
          timeoutMs,
          true
        )
        return extractFacebookPermalinks(html)[0]
      } catch {
        return undefined
      }
    },
  ]

  for (const run of strategies) {
    try {
      const resolved = await run()
      if (resolved && isUsableFacebookUrl(resolved)) {
        logger.info('facebook url resolved', { from: url, to: resolved })
        return resolved
      }
    } catch (error) {
      logger.warn('facebook url resolve strategy failed', {
        url,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.warn('facebook url resolve gave up', { url })
  return normalized
}
