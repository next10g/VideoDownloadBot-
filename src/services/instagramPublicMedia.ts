import {
  extractInstagramVideoCandidates,
  pickBestInstagramVideo,
  extractInstagramLsdToken,
} from '@/helpers/instagramVideoExtract'
import { decodeJsonUrl } from '@/helpers/instagramHtmlExtract'
import { instagramPostShortcode } from '@/helpers/instagramCarouselExtract'
import logger from '@/lib/logger'

const IG_APP_ID = '936619743392459'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** doc_id values rotate; try several known shortcode-media queries. */
const GRAPHQL_DOC_IDS = [
  '10015901848480474',
  '8845758581914444',
  '24368985919464652',
  '25981206651899035',
  '7565674227165930',
]

function extractVideoFromJson(data: unknown): string | undefined {
  const candidates = extractInstagramVideoCandidates(
    typeof data === 'string' ? data : JSON.stringify(data)
  )
  return pickBestInstagramVideo(candidates)?.url
}

export async function fetchInstagramPageHtml(postUrl: string): Promise<string> {
  const clean = postUrl.split('?')[0]
  for (const ua of [IG_ANDROID_UA, IG_DESKTOP_UA]) {
    try {
      const res = await fetch(clean, {
        signal: AbortSignal.timeout(22_000),
        headers: {
          'User-Agent': ua,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://www.instagram.com/',
        },
        redirect: 'follow',
      })
      if (res.ok) {
        return await res.text()
      }
    } catch {
      // next UA
    }
  }
  return ''
}

async function resolveViaGraphql(
  shortcode: string,
  lsd?: string
): Promise<string | undefined> {
  const variables = JSON.stringify({ shortcode })

  for (const docId of GRAPHQL_DOC_IDS) {
    try {
      const body = new URLSearchParams({
        variables,
        doc_id: docId,
        ...(lsd ? { lsd, fb_api_req_friendly_name: 'PolarisPostActionLoadPostQuery' } : {}),
      })

      const res = await fetch('https://www.instagram.com/api/graphql', {
        method: 'POST',
        signal: AbortSignal.timeout(18_000),
        headers: {
          'User-Agent': IG_DESKTOP_UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-IG-App-ID': IG_APP_ID,
          'X-ASBD-ID': '129477',
          'X-FB-LSD': lsd || '',
          Accept: '*/*',
          Referer: `https://www.instagram.com/reel/${shortcode}/`,
          Origin: 'https://www.instagram.com',
        },
        body: body.toString(),
      })

      if (!res.ok) {
        continue
      }

      const text = await res.text()
      const videoUrl = extractVideoFromJson(text)
      if (videoUrl) {
        logger.info('instagram graphql video ok', { shortcode, docId })
        return videoUrl
      }
    } catch {
      // try next doc_id
    }
  }

  return undefined
}

/** Scrape reel/post page HTML for video_versions (no cookies). */
export async function resolveInstagramVideoFromPage(
  postUrl: string
): Promise<string | undefined> {
  const html = await fetchInstagramPageHtml(postUrl)
  if (!html) {
    return undefined
  }
  const best = pickBestInstagramVideo(extractInstagramVideoCandidates(html))
  if (best) {
    logger.info('instagram page video ok', {
      url: postUrl,
      width: best.width,
      source: best.source,
    })
    return best.url
  }
  return undefined
}

/** Cookie-less Instagram API + GraphQL (datacenter-friendly). */
export async function resolveInstagramVideoViaApi(
  postUrl: string
): Promise<string | undefined> {
  const shortcode = instagramPostShortcode(postUrl)
  if (!shortcode) {
    return undefined
  }

  const fromPage = await resolveInstagramVideoFromPage(postUrl)
  if (fromPage) {
    return fromPage
  }

  const html = await fetchInstagramPageHtml(postUrl)
  const lsd = html ? extractInstagramLsdToken(html) : undefined
  const fromGraphql = await resolveViaGraphql(shortcode, lsd)
  if (fromGraphql) {
    return fromGraphql
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
        logger.info('instagram legacy api video ok', { url: postUrl, shortcode })
        return decodeJsonUrl(videoUrl)
      }
    } catch {
      // try next endpoint
    }
  }

  return undefined
}
