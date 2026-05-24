/** Map raw yt-dlp stderr to a short i18n key (optional). */
export function ytdlpErrorI18nKey(detail: string): string | undefined {
  const lower = detail.toLowerCase()
  if (
    lower.includes("isn't available to everyone") ||
    lower.includes('not available to everyone') ||
    lower.includes('certain audiences')
  ) {
    return 'error_instagram_restricted'
  }
  if (lower.includes('login required') || lower.includes('cookies')) {
    return 'error_instagram_login'
  }
  if (lower.includes('no video in this post')) {
    return 'error_instagram_photo_only'
  }
  return undefined
}
