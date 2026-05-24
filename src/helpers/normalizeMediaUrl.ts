/** Fix HTML-escaped CDN URLs before fetch / yt-dlp. */
export function normalizeMediaUrl(url: string): string {
  return url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
}

/** Prefer full-frame Instagram CDN URL (drop crop box + tiny stp size). */
export function upscaleInstagramCdnUrl(url: string): string {
  let u = normalizeMediaUrl(url)
  u = u.replace(/stp=c[^&]*&/i, 'stp=dst-jpg&')
  u = u.replace(/_s\d+x\d+[^/&]*/gi, 's1080x1080')
  return u
}
