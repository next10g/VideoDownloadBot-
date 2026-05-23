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

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return trimmed
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
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
