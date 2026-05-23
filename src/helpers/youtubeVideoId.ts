export function extractYoutubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0]
      return id || undefined
    }
    if (host.includes('youtube.com')) {
      const fromQuery = parsed.searchParams.get('v')
      if (fromQuery) {
        return fromQuery
      }
      const shorts = parsed.pathname.match(/^\/shorts\/([^/]+)/)
      if (shorts?.[1]) {
        return shorts[1]
      }
      const embed = parsed.pathname.match(/^\/embed\/([^/]+)/)
      if (embed?.[1]) {
        return embed[1]
      }
    }
  } catch {
    const match = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/
    )
    return match?.[1]
  }
  return undefined
}
