import { normalizeMediaUrl, upscaleInstagramCdnUrl } from '@/helpers/normalizeMediaUrl'

/** Instagram embed/page JSON escapes quotes as \\" */
const DISPLAY_URL_RE = /display_url\\":\\"([^"]+)"|"display_url":"([^"]+)"/g

const IMAGE_VERSIONS_URL_RE =
  /"width":(\d+)[^}]*"url":\\"([^"]+)"|"width":(\d+)[^}]*"url":"([^"]+)"/g

export function decodeJsonUrl(raw: string): string {
  return normalizeMediaUrl(raw.replace(/\\\//g, '/'))
}

/** Collect display_url values from HTML (optionally within a slice). */
export function extractDisplayUrls(
  html: string,
  start = 0,
  maxLen?: number
): string[] {
  const slice = maxLen ? html.slice(start, start + maxLen) : html.slice(start)
  const urls: string[] = []
  const re = new RegExp(DISPLAY_URL_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(slice))) {
    const raw = match[1] || match[2] || ''
    const url = decodeJsonUrl(raw)
    if (url.startsWith('http')) {
      urls.push(url)
    }
  }
  return urls
}

/** Highest-width candidate per image_versions2 block. */
export function extractHighResFromHtml(html: string): string[] {
  const slides: string[] = []
  const parts = html.split('"image_versions2"')
  for (let i = 1; i < parts.length; i++) {
    const section = parts[i].slice(0, 20_000)
    let bestW = 0
    let bestUrl = ''
    const re = new RegExp(IMAGE_VERSIONS_URL_RE.source, 'g')
    let match: RegExpExecArray | null
    while ((match = re.exec(section))) {
      const w = Number(match[1] || match[3] || 0)
      const raw = match[2] || match[4] || ''
      if (w >= bestW && raw) {
        bestW = w
        bestUrl = decodeJsonUrl(raw)
      }
    }
    if (bestUrl.startsWith('http')) {
      slides.push(bestUrl)
    }
  }
  return slides
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
