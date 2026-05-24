import { decodeJsonUrl } from '@/helpers/instagramHtmlExtract'

export interface InstagramVideoCandidate {
  url: string
  width: number
  source: string
}

const MIN_VIDEO_WIDTH = 144
const MAX_VIDEO_WIDTH = 1920

const VIDEO_BLOCK_RE =
  /"video_versions"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:has_audio|video_duration|is_video)"/g

export function isLikelyInstagramVideoUrl(url: string): boolean {
  const path = url.split('?')[0].toLowerCase()
  if (/\.(jpe?g|png|webp|gif|heic)$/.test(path)) {
    return false
  }
  if (/\.(mp4|m3u8)(\?|$)/.test(path)) {
    return true
  }
  if (!/cdninstagram|fbcdn/i.test(url)) {
    return false
  }
  return (
    /\/v\/t\d+/i.test(url) ||
    /video/i.test(url) ||
    /e15=/.test(url) ||
    /\.mp4/i.test(url)
  )
}

function isSaneVideoWidth(width: number): boolean {
  return width >= MIN_VIDEO_WIDTH && width <= MAX_VIDEO_WIDTH
}

function parseVideoVersionsBlock(block: string): InstagramVideoCandidate[] {
  const out: InstagramVideoCandidate[] = []
  const re =
    /"width"\s*:\s*(\d+)[\s\S]{0,400}?"url"\s*:\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const width = Number(match[1] || 0)
    const url = decodeJsonUrl(match[2] || '')
    if (
      isSaneVideoWidth(width) &&
      isLikelyInstagramVideoUrl(url)
    ) {
      out.push({ url, width, source: 'video_versions' })
    }
  }
  return out
}

function extractOgVideo(html: string): InstagramVideoCandidate[] {
  const out: InstagramVideoCandidate[] = []
  const patterns = [
    /property="og:video(?::secure_url)?" content="([^"]+)"/gi,
    /content="([^"]+)" property="og:video(?::secure_url)?"/gi,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html))) {
      const url = decodeJsonUrl(match[1] || '')
      if (url.startsWith('http') && isLikelyInstagramVideoUrl(url)) {
        out.push({ url, width: 720, source: 'og:video' })
      }
    }
  }
  return out
}

function extractLooseVideoUrls(html: string): InstagramVideoCandidate[] {
  const out: InstagramVideoCandidate[] = []
  const patterns = [
    /video_url\\":\\"([^"]+)"/g,
    /"video_url":"([^"]+)"/g,
    /playback_url\\":\\"([^"]+)"/g,
    /"playback_url":"([^"]+)"/g,
  ]
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, 'g')
    let match: RegExpExecArray | null
    while ((match = re.exec(html))) {
      const url = decodeJsonUrl(match[1] || '')
      if (url.startsWith('http') && isLikelyInstagramVideoUrl(url)) {
        out.push({ url, width: 720, source: 'json_field' })
      }
    }
  }
  return out
}

/** Collect reel/post video URLs ranked by width (highest first). */
export function extractInstagramVideoCandidates(html: string): InstagramVideoCandidate[] {
  if (!html || html.length < 500) {
    return []
  }

  const all: InstagramVideoCandidate[] = []
  all.push(...extractOgVideo(html))

  let blockMatch: RegExpExecArray | null
  const blockRe = new RegExp(VIDEO_BLOCK_RE.source, 'g')
  while ((blockMatch = blockRe.exec(html))) {
    all.push(...parseVideoVersionsBlock(blockMatch[1] || ''))
  }

  all.push(...extractLooseVideoUrls(html))

  const byUrl = new Map<string, InstagramVideoCandidate>()
  for (const c of all) {
    const prev = byUrl.get(c.url)
    if (!prev || c.width > prev.width) {
      byUrl.set(c.url, c)
    }
  }

  return [...byUrl.values()]
    .filter((c) => isLikelyInstagramVideoUrl(c.url))
    .sort((a, b) => b.width - a.width)
}

export function pickBestInstagramVideo(
  candidates: InstagramVideoCandidate[]
): InstagramVideoCandidate | undefined {
  const sane = candidates.filter(
    (c) => isSaneVideoWidth(c.width) || c.source === 'og:video'
  )
  const pool = sane.length > 0 ? sane : candidates
  const mp4 = pool.filter((c) => !/\.m3u8/i.test(c.url))
  if (mp4.length > 0) {
    return mp4[0]
  }
  return pool[0]
}

export function extractInstagramLsdToken(html: string): string | undefined {
  const m =
    html.match(/"LSD",\[\],\{"token":"([^"]+)"/) ||
    html.match(/"lsd":"([A-Za-z0-9_-]+)"/) ||
    html.match(/name="lsd" value="([^"]+)"/)
  return m?.[1]
}
