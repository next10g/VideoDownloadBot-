const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'si',
  'feature',
]

/** Expand short hosts so yt-dlp gets a canonical URL. */
function expandShortHosts(url: URL): void {
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0]
    if (id) {
      url.hostname = 'www.youtube.com'
      url.pathname = '/watch'
      url.search = `?v=${id}`
    }
  }
  if (
    url.hostname.includes('youtube.com') &&
    url.pathname.startsWith('/shorts/')
  ) {
    const id = url.pathname.split('/')[2]
    if (id) {
      url.pathname = '/watch'
      url.search = `?v=${id}`
    }
  }
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return trimmed
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    if (
      url.hostname === 'facebook.com' ||
      url.hostname === 'fb.com' ||
      url.hostname === 'm.facebook.com' ||
      url.hostname === 'web.facebook.com'
    ) {
      url.hostname = 'www.facebook.com'
    }
    expandShortHosts(url)
    for (const param of TRACKING_PARAMS) {
      url.searchParams.delete(param)
    }
    url.hash = ''
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }
    return url.toString()
  } catch {
    return trimmed
  }
}

export function extractFirstUrl(text: string): string | undefined {
  const match = text.match(
    /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/i
  )
  return match?.[0]
}
