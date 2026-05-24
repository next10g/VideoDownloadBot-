/** Fix HTML-escaped CDN URLs before fetch / yt-dlp. */
export function normalizeMediaUrl(url: string): string {
  return url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
}

/** Prefer larger Instagram CDN variant when URL embeds a small stp size. */
export function upscaleInstagramCdnUrl(url: string): string {
  let u = normalizeMediaUrl(url)
  u = u.replace(/_s\d+x\d+_/g, '_s1080x1080_')
  u = u.replace(/stp=[^&]+&/, 'stp=dst-jpg&')
  return u
}
