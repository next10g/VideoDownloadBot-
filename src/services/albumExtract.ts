import type { YtDlpMetadata } from '@/services/ytdlpTypes'

type FormatRow = Record<string, unknown>

function addImageFormat(urls: Set<string>, f: FormatRow): void {
  const ext = String(f.ext || '')
  const vcodec = String(f.vcodec || 'none')
  const url = String(f.url || '')
  if (
    url &&
    /^jpe?g|png|webp|gif$/i.test(ext) &&
    (vcodec === 'none' || !vcodec)
  ) {
    urls.add(url)
  }
}

function addEntryImages(urls: Set<string>, entry: YtDlpMetadata): void {
  const e = entry as YtDlpMetadata & {
    url?: string
    ext?: string
    formats?: FormatRow[]
  }
  if (e.url && /^jpe?g|png|webp|gif$/i.test(String(e.ext || ''))) {
    urls.add(e.url)
  }
  const formats = e.formats
  if (formats?.length) {
    for (const f of formats) {
      addImageFormat(urls, f)
    }
  }
  const thumbs = e.thumbnails
  if (thumbs?.length) {
    const best = thumbs[thumbs.length - 1]?.url
    if (best) {
      urls.add(best)
    }
  }
}

/** Collect image URLs from carousel / multi-image posts. */
export function extractAlbumImageUrls(meta: YtDlpMetadata): string[] {
  const urls = new Set<string>()

  const entries = meta.entries
  if (entries?.length) {
    for (const entry of entries) {
      addEntryImages(urls, entry)
    }
  }

  const formats = (meta as YtDlpMetadata & { formats?: FormatRow[] }).formats
  if (formats?.length) {
    for (const f of formats) {
      addImageFormat(urls, f)
    }
  }

  if (urls.size === 0 && meta.thumbnails?.length) {
    const thumb = meta.thumbnails[meta.thumbnails.length - 1]?.url
    if (thumb) {
      urls.add(thumb)
    }
  }

  return [...urls]
}
