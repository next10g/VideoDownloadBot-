import { normalizeMediaUrl, upscaleInstagramCdnUrl } from '@/helpers/normalizeMediaUrl'
import logger from '@/lib/logger'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function decodeJsonUrl(raw: string): string {
  return normalizeMediaUrl(raw.replace(/\\\//g, '/'))
}

export function instagramPostShortcode(postUrl: string): string {
  const m = postUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)
  return m?.[1] || ''
}

export function htmlLooksLikeSidecar(html: string): boolean {
  return /GraphSidecar|XDTGraphSidecar|edge_sidecar_to_children|carousel_media_count|"product_type":"carousel"/i.test(
    html
  )
}

/** Unique CDN asset id per slide (avoid collapsing carousel to one image). */
export function dedupeByAssetId(urls: string[]): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const url = upscaleInstagramCdnUrl(raw)
    const id =
      url.match(/\/(\d{8,}_\d+_\d+_n\.)/)?.[1] ||
      url.match(/\/([A-Za-z0-9_-]{20,})\.(?:jpg|webp)/)?.[1] ||
      url
    if (!seen.has(id)) {
      seen.add(id)
      ordered.push(url)
    }
  }
  return ordered
}

/** Pull every display_url from page JSON (works for public carousel HTML). */
export function extractAllSlideDisplayUrls(html: string): string[] {
  const urls: string[] = []
  const patterns = [
    /"display_url":"([^"]+)"/g,
    /"url":"(https?:\\\/\\\/[^"]+?cdninstagram[^"]+)"/gi,
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(html))) {
      const raw = decodeJsonUrl(match[1])
      if (raw.startsWith('http') && /cdninstagram|fbcdn/i.test(raw)) {
        urls.push(raw)
      }
    }
  }
  return dedupeByAssetId(urls)
}

async function fetchPostHtml(postUrl: string): Promise<string> {
  for (const ua of [IG_DESKTOP_UA, IG_UA]) {
    try {
      const res = await fetch(postUrl.split('?')[0], {
        signal: AbortSignal.timeout(25_000),
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
      // try next UA
    }
  }
  return ''
}

/** Scrape full carousel from post page when embed only exposes slide 1. */
export async function scrapeCarouselFromPostPage(
  postUrl: string
): Promise<string[]> {
  const html = await fetchPostHtml(postUrl)
  if (!html) {
    return []
  }
  if (!htmlLooksLikeSidecar(html)) {
    return []
  }
  const slides = extractAllSlideDisplayUrls(html)
  if (slides.length > 1) {
    logger.info('instagram carousel page scrape', {
      url: postUrl,
      count: slides.length,
    })
  }
  return slides
}
