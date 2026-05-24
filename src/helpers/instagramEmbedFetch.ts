import {
  dedupeByAssetId,
  extractDisplayUrls,
} from '@/helpers/instagramHtmlExtract'
import { extractInstagramVideoCandidates } from '@/helpers/instagramVideoExtract'
import { isInstagramReelUrl } from '@/helpers/instagramUrl'
import logger from '@/lib/logger'

const IG_IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

const IG_APP_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

/** Desktop embed often omits carousel JSON; mobile/app UAs return all slides. */
const EMBED_USER_AGENTS = [IG_IPHONE_UA, IG_APP_UA, IG_DESKTOP_UA, GOOGLEBOT_UA]

async function fetchEmbedWithUa(
  embedUrl: string,
  userAgent: string
): Promise<string> {
  try {
    const res = await fetch(embedUrl, {
      signal: AbortSignal.timeout(22_000),
      headers: {
        'User-Agent': userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.instagram.com/',
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      return ''
    }
    return await res.text()
  } catch {
    return ''
  }
}

function scoreEmbedHtml(html: string, postUrl: string): number {
  if (!html || html.length < 500) {
    return 0
  }
  if (/login_required|LoginAndSignupPage/i.test(html)) {
    return 0
  }
  if (isInstagramReelUrl(postUrl)) {
    const videos = extractInstagramVideoCandidates(html)
    if (videos.length > 0) {
      return 1000 + videos[0].width
    }
  }
  return dedupeByAssetId(extractDisplayUrls(html)).length
}

/** Fetch embed HTML using the UA that exposes the most carousel image URLs. */
export async function fetchBestInstagramEmbedHtml(
  postUrl: string
): Promise<{ html: string; slideCount: number; userAgent: string }> {
  const base = postUrl.split('?')[0].replace(/\/$/, '')
  let bestHtml = ''
  let bestCount = 0
  let bestUa = IG_IPHONE_UA

  for (const ua of EMBED_USER_AGENTS) {
    for (const suffix of ['embed/captioned/', 'embed/']) {
      const html = await fetchEmbedWithUa(`${base}/${suffix}`, ua)
      const count = scoreEmbedHtml(html, postUrl)
      if (count > bestCount) {
        bestCount = count
        bestHtml = html
        bestUa = ua
      }
    }
  }

  if (bestCount > 0) {
    logger.info('instagram embed fetch', {
      url: postUrl,
      slides: bestCount,
      htmlLen: bestHtml.length,
      ua: bestUa.includes('Instagram') ? 'ig-app' : bestUa.includes('iPhone') ? 'iphone' : 'other',
    })
  }

  return { html: bestHtml, slideCount: bestCount, userAgent: bestUa }
}
