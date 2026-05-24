export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return host === 'instagram.com' || host.endsWith('.instagram.com')
  } catch {
    return false
  }
}
