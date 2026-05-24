import { normalizeMediaUrl, upscaleInstagramCdnUrl } from '@/helpers/normalizeMediaUrl'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

type FormatRow = Record<string, unknown>

function formatPixels(f: FormatRow): number {
  const w = Number(f.width || 0)
  const h = Number(f.height || 0)
  return w > 0 && h > 0 ? w * h : 0
}

function bestUrlFromFormats(formats: FormatRow[] | undefined): string | undefined {
  let bestUrl: string | undefined
  let bestPixels = 0
  for (const f of formats || []) {
    const url = String(f.url || '')
    const vcodec = String(f.vcodec || 'none')
    if (!url || (vcodec !== 'none' && vcodec !== '')) {
      continue
    }
    const ext = String(f.ext || '')
    const looksLikeImage =
      /^jpe?g|png|webp|gif$/i.test(ext) ||
      /\.(jpe?g|png|webp)(\?|$)/i.test(url) ||
      /cdninstagram|fbcdn/i.test(url)
    if (!looksLikeImage) {
      continue
    }
    const pixels = formatPixels(f)
    if (pixels > bestPixels) {
      bestPixels = pixels
      bestUrl = url
    }
  }
  return bestUrl
}

function urlsFromEntry(entry: YtDlpMetadata): string[] {
  const row = entry as YtDlpMetadata & {
    url?: string
    ext?: string
    formats?: FormatRow[]
  }
  const fromFormats = bestUrlFromFormats(row.formats)
  if (fromFormats) {
    return [upscaleInstagramCdnUrl(fromFormats)]
  }
  if (row.url && /^jpe?g|png|webp|gif$/i.test(String(row.ext || ''))) {
    return [upscaleInstagramCdnUrl(row.url)]
  }
  return []
}

/** Collect full-resolution image URLs from carousel / multi-image posts (ordered). */
export function extractAlbumImageUrls(meta: YtDlpMetadata): string[] {
  const ordered: string[] = []

  const entries = meta.entries
  if (entries?.length) {
    for (const entry of entries) {
      const urls = urlsFromEntry(entry)
      if (urls[0]) {
        ordered.push(normalizeMediaUrl(urls[0]))
      }
    }
    if (ordered.length > 0) {
      return ordered
    }
  }

  const topFormats = (meta as YtDlpMetadata & { formats?: FormatRow[] }).formats
  const topBest = bestUrlFromFormats(topFormats)
  if (topBest) {
    return [normalizeMediaUrl(upscaleInstagramCdnUrl(topBest))]
  }

  if (meta.thumbnails?.length) {
    const thumb = meta.thumbnails[meta.thumbnails.length - 1]?.url
    if (thumb) {
      return [normalizeMediaUrl(upscaleInstagramCdnUrl(thumb))]
    }
  }

  return ordered
}
