export function isYoutubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')
  } catch {
    return /youtube\.com|youtu\.be/i.test(url)
  }
}
