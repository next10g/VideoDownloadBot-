import { scrapeCarouselFromPostPage } from '@/helpers/instagramCarouselExtract'
import {
  dedupeByAssetId,
  decodeJsonUrl,
  extractDisplayUrls,
  extractHighResFromHtml,
} from '@/helpers/instagramHtmlExtract'
import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import { normalizeMediaUrl } from '@/helpers/normalizeMediaUrl'
import { fetchBestInstagramEmbedHtml } from '@/helpers/instagramEmbedFetch'
import { isInstagramReelUrl } from '@/helpers/instagramUrl'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** More than this usually means we scraped suggested posts / UI chrome. */
const SCRAPE_SANITY_MAX = 15

const CAROUSEL_MARKERS = [
  'edge_sidecar_to_children',
  'edge_sidecar',
  'carousel_media',
  'GraphSidecar',
  'XDTGraphSidecar',
  'sidecar_child',
]

function htmlHasSidecar(html: string): boolean {
  return CAROUSEL_MARKERS.some((marker) => html.includes(marker))
}

/** Carousel slides — full-page URLs when sidecar (embed puts slides before marker). */
function extractSidecarDisplayUrls(html: string): string[] {
  if (htmlHasSidecar(html)) {
    const all = dedupeByAssetId(extractDisplayUrls(html))
    if (all.length > 1) {
      return all
    }
  }
  for (const marker of CAROUSEL_MARKERS) {
    const idx = html.indexOf(marker)
    if (idx >= 0) {
      const urls = extractDisplayUrls(html, idx, 500_000)
      if (urls.length > 1) {
        return dedupeByAssetId(urls)
      }
    }
  }
  const hiRes = extractHighResFromHtml(html)
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
    const m =
      chunk.match(/display_url\\":\\"([^"]+)"/) ||
      chunk.match(/"display_url":"([^"]+)"/)
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
  const { html } = await fetchBestInstagramEmbedHtml(postUrl)
  return html
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
  const hiRes = extractHighResFromHtml(html)
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

  const fromPage = await scrapeCarouselFromPostPage(postUrl)
  if (fromPage.length > 1) {
    return fromPage.slice(0, env.ALBUM_MAX_IMAGES)
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

  const sidecarHtml = embedHtml || ''
  if (raw.length === 0 && !htmlHasSidecar(sidecarHtml)) {
    raw = await scrapeOembed(postUrl)
  }

  if (raw.length > SCRAPE_SANITY_MAX) {
    logger.warn('instagram scrape too many candidates, using oembed', {
      url: postUrl,
      count: raw.length,
    })
    raw = await scrapeOembed(postUrl)
  }

  let filtered =
    raw.length > 1
      ? dedupeByAssetId(raw).slice(0, env.ALBUM_MAX_IMAGES)
      : filterSocialImageUrls(raw, postUrl).slice(0, env.ALBUM_MAX_IMAGES)

  if (filtered.length <= 1) {
    const { probeYtdlpInstagramCarousel } = await import(
      '@/services/instagramYtdlpCarousel'
    )
    const ytdlpUrls = await probeYtdlpInstagramCarousel(postUrl)
    if (ytdlpUrls.length > filtered.length) {
      filtered = ytdlpUrls.slice(0, env.ALBUM_MAX_IMAGES)
      logger.info('instagram scrape ytdlp fallback', {
        url: postUrl,
        count: filtered.length,
      })
    }
  }

  if (filtered.length > 0) {
    logger.info('instagram scrape ok', {
      url: postUrl,
      count: filtered.length,
      carousel: filtered.length > 1,
    })
  }
  return filtered
}
