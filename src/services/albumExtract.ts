import type { YtDlpMetadata } from '@/services/ytdlpTypes'

/** Collect image URLs from carousel / multi-image posts. */
export function extractAlbumImageUrls(meta: YtDlpMetadata): string[] {
  const urls = new Set<string>()

  const entries = meta.entries
  if (entries?.length) {
    for (const entry of entries) {
      const e = entry as YtDlpMetadata & { url?: string; ext?: string }
      if (e.url && /^jpe?g|png|webp|gif$/i.test(String(e.ext || ''))) {
        urls.add(e.url)
      }
      const thumb = e.thumbnails?.[e.thumbnails.length - 1]?.url
      if (thumb) {
        urls.add(thumb)
      }
    }
  }

  const formats = (meta as YtDlpMetadata & { formats?: Record<string, unknown>[] })
    .formats
  if (formats?.length) {
    for (const f of formats) {
      const ext = String(f.ext || '')
      const vcodec = String(f.vcodec || '')
      const url = String(f.url || '')
      if (
        url &&
        /^jpe?g|png|webp|gif$/i.test(ext) &&
        (vcodec === 'none' || !vcodec)
      ) {
        urls.add(url)
      }
    }
  }

  return [...urls]
}
