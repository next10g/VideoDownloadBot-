import { createFetchAgent } from '@/helpers/loadUndici'
import logger from '@/lib/logger'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { normalizeUrl } from '@/services/urlNormalize'

const FB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function extractFromHtml(html: string): string | undefined {
  const ogUrl = html.match(
    /property=["']og:url["']\s+content=["']([^"']+)["']/i
  )?.[1]
  if (ogUrl && isFacebookUrl(ogUrl) && !ogUrl.includes('/share/')) {
    return ogUrl
  }

  const reel =
    html.match(/https:\/\/(?:www\.)?facebook\.com\/reel\/\d+/i)?.[0] ||
    html.match(/"permalink_url"\s*:\s*"([^"]*\/reel\/\d+[^"]*)"/i)?.[1]
  if (reel) {
    return reel.replace(/\\\//g, '/')
  }

  const watch =
    html.match(/https:\/\/(?:www\.)?facebook\.com\/watch\/\?v=\d+/i)?.[0] ||
    html.match(/"video_id"\s*:\s*"(\d+)"/)?.[1]
  if (watch) {
    if (watch.startsWith('http')) {
      return watch
    }
    return `https://www.facebook.com/watch/?v=${watch}`
  }

  const videoUrl = html.match(
    /"browser_native_(?:sd|hd)_url"\s*:\s*"([^"]+)"/i
  )?.[1]
  if (videoUrl) {
    return undefined
  }

  return undefined
}

/** Expand facebook.com/share/… to reel/watch URL when possible. */
export async function resolveFacebookUrl(url: string): Promise<string> {
  if (!isFacebookUrl(url)) {
    return url
  }
  const needsResolve =
    /\/share\//i.test(url) || url.includes('fb.watch') || url.includes('fb.com')
  if (!needsResolve) {
    return url
  }

  const timeoutMs = 25_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'User-Agent': FB_UA,
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    } as RequestInit)

    const finalUrl = response.url || url
    if (isFacebookUrl(finalUrl) && !finalUrl.includes('/share/')) {
      const normalized = normalizeUrl(finalUrl)
      logger.info('facebook url resolved (redirect)', { from: url, to: normalized })
      return normalized
    }

    const html = await response.text()
    const extracted = extractFromHtml(html)
    if (extracted) {
      const normalized = normalizeUrl(extracted)
      logger.info('facebook url resolved (html)', { from: url, to: normalized })
      return normalized
    }
  } catch (error) {
    logger.warn('facebook url resolve failed', {
      url,
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearTimeout(timer)
  }

  return url
}
