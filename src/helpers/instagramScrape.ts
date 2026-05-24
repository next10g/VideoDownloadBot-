import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import { normalizeMediaUrl } from '@/helpers/normalizeMediaUrl'
import { isInstagramReelUrl } from '@/helpers/instagramUrl'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** More than this usually means we scraped suggested posts / UI chrome. */
const SCRAPE_SANITY_MAX = 15

function decodeJsonUrl(raw: string): string {
  return normalizeMediaUrl(raw.replace(/\\\//g, '/'))
}

function collectDisplayUrls(html: string, start: number, maxLen: number): string[] {
  const slice = html.slice(start, start + maxLen)
  const urls: string[] = []
  const re = /"display_url":"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(slice))) {
    const raw = decodeJsonUrl(match[1])
    if (raw.startsWith('http')) {
      urls.push(normalizeMediaUrl(raw))
    }
  }
  return urls
}

const CAROUSEL_MARKERS = [
  'edge_sidecar_to_children',
  'carousel_media',
  'XDTGraphSidecar',
  'sidecar_child',
]

/** Highest-width candidate per slide (full resolution, not 640 crop). */
function extractHighResCandidates(html: string): string[] {
  const slides: string[] = []
  const parts = html.split('"image_versions2"')
  for (let i = 1; i < parts.length; i++) {
    const section = parts[i].slice(0, 20_000)
    let bestW = 0
    let bestUrl = ''
    const re = /"width":(\d+)[^}]*"url":"([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = re.exec(section))) {
      const w = Number(match[1])
      if (w >= bestW) {
        bestW = w
        bestUrl = decodeJsonUrl(match[2])
      }
    }
    if (bestUrl.startsWith('http')) {
      slides.push(normalizeMediaUrl(bestUrl))
    }
  }
  return slides
}

/** Carousel slides from sidecar / carousel blocks in embed HTML. */
function extractSidecarDisplayUrls(html: string): string[] {
  for (const marker of CAROUSEL_MARKERS) {
    const idx = html.indexOf(marker)
    if (idx >= 0) {
      const urls = collectDisplayUrls(html, idx, 500_000)
      if (urls.length > 1) {
        return urls
      }
    }
  }
  const hiRes = extractHighResCandidates(html)
  if (hiRes.length > 1) {
    return hiRes
  }
  return []
}

/** Single photo post — one display_url from the main media node. */
function extractSinglePostDisplayUrl(html: string): string[] {
  const markers = [
    '"__typename":"GraphImage"',
    '"__typename":"XDTGraphImage"',
    '"is_video":false',
    '"shortcode_media":',
  ]
  for (const marker of markers) {
    const idx = html.indexOf(marker)
    if (idx < 0) {
      continue
    }
    const chunk = html.slice(idx, idx + 12_000)
    const m = chunk.match(/"display_url":"([^"]+)"/)
    if (m) {
      const url = decodeJsonUrl(m[1])
      if (url.startsWith('http')) {
        return [url]
      }
    }
  }
  const og = html.match(/property="og:image" content="([^"]+)"/)
  if (og?.[1]?.startsWith('http')) {
    return [og[1]]
  }
  return []
}

async function fetchHtml(url: string, ua: string): Promise<string> {
  const res = await fetch(url, {
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
  if (!res.ok) {
    return ''
  }
  return res.text()
}

async function scrapeEmbedHtml(postUrl: string): Promise<string> {
  const base = postUrl.split('?')[0].replace(/\/$/, '')
  for (const suffix of ['embed/captioned/', 'embed/']) {
    const html = await fetchHtml(`${base}/${suffix}`, IG_DESKTOP_UA)
    if (html) {
      return html
    }
  }
  return ''
}

async function scrapeOembed(postUrl: string): Promise<string[]> {
  const api = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`
  try {
    const res = await fetch(api, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': IG_UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      return []
    }
    const data = (await res.json()) as { thumbnail_url?: string }
    return data.thumbnail_url ? [data.thumbnail_url] : []
  } catch {
    return []
  }
}

function parsePostImages(html: string): string[] {
  const sidecar = extractSidecarDisplayUrls(html)
  if (sidecar.length > 0) {
    return sidecar
  }
  const hiRes = extractHighResCandidates(html)
  if (hiRes.length === 1) {
    return hiRes
  }
  if (hiRes.length > 1) {
    return hiRes
  }
  return extractSinglePostDisplayUrl(html)
}

/** Scrape IG photo/carousel URLs without cookies. Reels return []. */
export async function scrapeAllInstagramImages(postUrl: string): Promise<string[]> {
  if (isInstagramReelUrl(postUrl)) {
    return []
  }

  let raw: string[] = []
  const embedHtml = await scrapeEmbedHtml(postUrl)
  if (embedHtml) {
    raw = parsePostImages(embedHtml)
  }

  if (raw.length === 0) {
    const pageHtml = await fetchHtml(postUrl, IG_UA)
    if (pageHtml) {
      raw = parsePostImages(pageHtml)
    }
  }

  if (raw.length === 0) {
    raw = await scrapeOembed(postUrl)
  }

  if (raw.length > SCRAPE_SANITY_MAX) {
    logger.warn('instagram scrape too many candidates, using oembed', {
      url: postUrl,
      count: raw.length,
    })
    raw = await scrapeOembed(postUrl)
  }

  const filtered = filterSocialImageUrls(raw, postUrl).slice(
    0,
    env.ALBUM_MAX_IMAGES
  )
  if (filtered.length > 0) {
    logger.info('instagram scrape ok', {
      url: postUrl,
      count: filtered.length,
      carousel: filtered.length > 1,
    })
  }
  return filtered
}
