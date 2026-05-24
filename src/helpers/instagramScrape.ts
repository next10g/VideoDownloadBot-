import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import logger from '@/lib/logger'

const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function decodeJsonUrl(raw: string): string {
  return raw.replace(/\\u0026/g, '&').replace(/\\\//g, '/')
}

function extractDisplayUrlsFromHtml(html: string): string[] {
  const urls = new Set<string>()
  const patterns = [
    /"display_url":"([^"]+)"/g,
    /"display_resources":\[[^\]]*"src":"([^"]+)"/g,
    /"url":"(https?:\\\/\\\/[^"]+?cdninstagram[^"]+)"/gi,
    /property="og:image" content="([^"]+)"/g,
    /"thumbnail_src":"([^"]+)"/g,
    /(https:\/\/[^\s"'\\]+\.cdninstagram\.com\/[^\s"'\\]+)/gi,
    /(https:\/\/[^\s"'\\]+?scontent[^\s"'\\]*?cdninstagram[^\s"'\\]+)/gi,
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(html))) {
      const raw = decodeJsonUrl(match[1] || match[0])
      if (raw.startsWith('http') && /cdninstagram|fbcdn/i.test(raw)) {
        urls.add(raw.split('&amp;').join('&'))
      }
    }
  }
  return [...urls]
}

async function fetchHtml(url: string, ua: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(22_000),
    headers: {
      'User-Agent': ua,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.instagram.com/',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    return ''
  }
  return res.text()
}

async function scrapeEmbed(postUrl: string, suffix: string): Promise<string[]> {
  const base = postUrl.split('?')[0].replace(/\/$/, '')
  const html = await fetchHtml(`${base}/${suffix}`, IG_DESKTOP_UA)
  if (!html) {
    return []
  }
  return extractDisplayUrlsFromHtml(html)
}

async function scrapeOembed(postUrl: string): Promise<string[]> {
  const api = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`
  try {
    const res = await fetch(api, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': IG_UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      return []
    }
    const data = (await res.json()) as { thumbnail_url?: string }
    return data.thumbnail_url ? [data.thumbnail_url] : []
  } catch {
    return []
  }
}

/** Scrape IG photo/carousel URLs without cookies (embed → post page → oEmbed). */
export async function scrapeAllInstagramImages(postUrl: string): Promise<string[]> {
  const collected = new Set<string>()

  for (const suffix of ['embed/captioned/', 'embed/']) {
    for (const url of await scrapeEmbed(postUrl, suffix)) {
      collected.add(url)
    }
    if (collected.size > 0) {
      break
    }
  }

  if (collected.size === 0) {
    const pageHtml = await fetchHtml(postUrl, IG_UA)
    if (pageHtml) {
      for (const url of extractDisplayUrlsFromHtml(pageHtml)) {
        collected.add(url)
      }
    }
  }

  if (collected.size === 0) {
    for (const url of await scrapeOembed(postUrl)) {
      collected.add(url)
    }
  }

  const filtered = filterSocialImageUrls([...collected], postUrl)
  if (filtered.length > 0) {
    logger.info('instagram scrape ok', { url: postUrl, count: filtered.length })
  }
  return filtered
}
