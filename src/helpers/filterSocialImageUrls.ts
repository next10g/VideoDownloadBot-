import { isInstagramUrl } from '@/helpers/instagramUrl'

/** Score URL by embedded /sWxH/ size (higher = larger). */
function resolutionScore(url: string): number {
  const m = url.match(/\/s(\d+)x(\d+)/i)
  if (m) {
    return Number(m[1]) * Number(m[2])
  }
  if (/\/p\d+x\d+\//i.test(url)) {
    return 100
  }
  return 10_000_000
}

function mediaKey(url: string): string {
  const path = url.split('?')[0]
  return path
    .replace(/\/s\d+x\d+[^/]*\//gi, '/')
    .replace(/\/p\d+x\d+\//gi, '/')
    .replace(/\/\d+x\d+\//g, '/')
}

function isLikelyIgPhoto(url: string): boolean {
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) {
    return false
  }
  if (/profile_pic|avatar|emoji|sprite|static\.cdninstagram/i.test(url)) {
    return false
  }
  if (/\.(mp4|m4v|mov)(\?|$)/i.test(url)) {
    return false
  }
  return /\.(jpe?g|webp|png)(\?|$)/i.test(url) || /\/v\/t\d+/i.test(url)
}

function filterPass(
  urls: string[],
  pageUrl: string | undefined,
  minScore: number,
  requireIgPhoto: boolean
): string[] {
  const byKey = new Map<string, { url: string; score: number }>()

  for (const raw of urls) {
    const url = raw.trim()
    if (!url.startsWith('http')) {
      continue
    }
    if (
      requireIgPhoto &&
      pageUrl &&
      isInstagramUrl(pageUrl) &&
      !isLikelyIgPhoto(url)
    ) {
      continue
    }
    const score = resolutionScore(url)
    if (score < minScore) {
      continue
    }
    const key = mediaKey(url)
    const prev = byKey.get(key)
    if (!prev || score > prev.score) {
      byKey.set(key, { url, score })
    }
  }

  return [...byKey.values()]
    .sort((a, b) => a.score - b.score)
    .map((v) => v.url)
}

/** Keep one best-resolution URL per slide; drop tiny thumbnails. */
export function filterSocialImageUrls(urls: string[], pageUrl?: string): string[] {
  const strict = filterPass(urls, pageUrl, 150 * 150, true)
  if (strict.length > 0) {
    return strict
  }
  const relaxed = filterPass(urls, pageUrl, 80 * 80, true)
  if (relaxed.length > 0) {
    return relaxed
  }
  return filterPass(urls, pageUrl, 0, false)
}
