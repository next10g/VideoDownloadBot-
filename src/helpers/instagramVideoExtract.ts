import { decodeJsonUrl } from '@/helpers/instagramHtmlExtract'

export interface InstagramVideoCandidate {
  url: string
  width: number
  source: string
}

const VIDEO_BLOCK_RE =
  /"video_versions"\s*:\s*(\[[\s\S]*?\])\s*,\s*"(?:has_audio|video_duration|is_video)"/g

function parseVideoVersionsBlock(block: string): InstagramVideoCandidate[] {
  const out: InstagramVideoCandidate[] = []
  const re =
    /"width"\s*:\s*(\d+)[\s\S]*?"url"\s*:\s*"((?:https?:\\\/\\\/|https?:\/\/)[^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const width = Number(match[1] || 0)
    const url = decodeJsonUrl(match[2] || '')
    if (url.startsWith('http') && /cdninstagram|fbcdn/i.test(url)) {
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
      if (url.startsWith('http')) {
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
      if (
        url.startsWith('http') &&
        (/cdninstagram|fbcdn/i.test(url) || /\.(mp4|m3u8)/i.test(url.split('?')[0]))
      ) {
        out.push({ url, width: 640, source: 'json_field' })
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
  let blockMatch: RegExpExecArray | null
  const blockRe = new RegExp(VIDEO_BLOCK_RE.source, 'g')
  while ((blockMatch = blockRe.exec(html))) {
    all.push(...parseVideoVersionsBlock(blockMatch[1] || ''))
  }
  all.push(...extractOgVideo(html))
  all.push(...extractLooseVideoUrls(html))

  const byUrl = new Map<string, InstagramVideoCandidate>()
  for (const c of all) {
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(c.url.split('?')[0])) {
      continue
    }
    const prev = byUrl.get(c.url)
    if (!prev || c.width > prev.width) {
      byUrl.set(c.url, c)
    }
  }

  return [...byUrl.values()].sort((a, b) => b.width - a.width)
}

export function pickBestInstagramVideo(
  candidates: InstagramVideoCandidate[]
): InstagramVideoCandidate | undefined {
  const mp4 = candidates.filter((c) => !/\.m3u8/i.test(c.url))
  if (mp4.length > 0) {
    return mp4[0]
  }
  return candidates[0]
}

export function extractInstagramLsdToken(html: string): string | undefined {
  const m =
    html.match(/"LSD",\[\],\{"token":"([^"]+)"/) ||
    html.match(/"lsd":"([A-Za-z0-9_-]+)"/) ||
    html.match(/name="lsd" value="([^"]+)"/)
  return m?.[1]
}
