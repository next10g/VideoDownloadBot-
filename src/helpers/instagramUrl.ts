export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return host === 'instagram.com' || host.endsWith('.instagram.com')
  } catch {
    return false
  }
}

/** Reels, IGTV (/tv/), and other direct video paths — never treat as photo carousel. */
export function isInstagramReelUrl(url: string): boolean {
  return isInstagramUrl(url) && /\/(reel|tv)\//i.test(url)
}

export function isInstagramVideoPostUrl(url: string): boolean {
  return isInstagramReelUrl(url)
}
