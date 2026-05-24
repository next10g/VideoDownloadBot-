import { decodeJsonUrl } from '@/helpers/instagramHtmlExtract'
import { instagramPostShortcode } from '@/helpers/instagramCarouselExtract'
import logger from '@/lib/logger'

const IG_APP_ID = '936619743392459'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

function extractVideoFromJson(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }
  const stack: unknown[] = [data]
  const seen = new Set<unknown>()
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object' || seen.has(node)) {
      continue
    }
    seen.add(node)
    const rec = node as Record<string, unknown>
    for (const key of ['video_url', 'playback_url']) {
      const val = rec[key]
      if (typeof val === 'string' && val.startsWith('http')) {
        return decodeJsonUrl(val)
      }
    }
    for (const val of Object.values(rec)) {
      if (val && typeof val === 'object') {
        stack.push(val)
      }
    }
  }
  return undefined
}

/** Cookie-less Instagram API probe (works for some public reels when embed CDN is blocked). */
export async function resolveInstagramVideoViaApi(
  postUrl: string
): Promise<string | undefined> {
  const shortcode = instagramPostShortcode(postUrl)
  if (!shortcode) {
    return undefined
  }

  const endpoints = [
    `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
    `https://www.instagram.com/reel/${shortcode}/?__a=1&__d=dis`,
    `https://www.instagram.com/tv/${shortcode}/?__a=1&__d=dis`,
  ]

  for (const apiUrl of endpoints) {
    try {
      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(18_000),
        headers: {
          'User-Agent': IG_ANDROID_UA,
          'X-IG-App-ID': IG_APP_ID,
          'X-ASBD-ID': '129477',
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://www.instagram.com/',
        },
        redirect: 'follow',
      })
      if (!res.ok) {
        continue
      }
      const text = await res.text()
      if (!text.trimStart().startsWith('{')) {
        continue
      }
      const data = JSON.parse(text) as unknown
      const videoUrl = extractVideoFromJson(data)
      if (videoUrl) {
        logger.info('instagram api video ok', { url: postUrl, shortcode })
        return videoUrl
      }
    } catch {
      // try next endpoint
    }
  }

  return undefined
}
