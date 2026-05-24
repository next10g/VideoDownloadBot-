import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { instagramPostShortcode } from '@/helpers/instagramCarouselExtract'
import env from '@/helpers/env'
import { createFetchAgent } from '@/helpers/loadUndici'
import logger from '@/lib/logger'

const IG_APP_ID = '936619743392459'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface HeaderSet {
  referer: string
  userAgent: string
  origin?: string
  useRange: boolean
}

function buildReferers(postUrl: string): string[] {
  const base = postUrl.split('?')[0].replace(/\/$/, '')
  const code = instagramPostShortcode(postUrl)
  const refs = [
    `${base}/embed/captioned/`,
    `${base}/embed/`,
    base + '/',
    'https://www.instagram.com/',
  ]
  if (code) {
    refs.push(`https://www.instagram.com/reel/${code}/`)
    refs.push(`https://www.instagram.com/p/${code}/`)
  }
  return [...new Set(refs)]
}

function buildHeaderSets(postUrl: string): HeaderSet[] {
  const referers = buildReferers(postUrl)
  const sets: HeaderSet[] = []
  for (const referer of referers) {
    for (const userAgent of [IG_ANDROID_UA, IG_IPHONE_UA, IG_DESKTOP_UA]) {
      sets.push({
        referer,
        userAgent,
        origin: 'https://www.instagram.com',
        useRange: true,
      })
      sets.push({
        referer,
        userAgent,
        origin: 'https://www.instagram.com',
        useRange: false,
      })
    }
  }
  return sets
}

function videoUrlCandidates(raw: string): string[] {
  const base = raw.split('?')[0]
  const out = [raw]
  if (raw !== base) {
    out.push(base)
  }
  return [...new Set(out)]
}

async function tryDownload(
  videoUrl: string,
  destPath: string,
  headers: HeaderSet,
  timeoutMs: number
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const reqHeaders: Record<string, string> = {
      'User-Agent': headers.userAgent,
      Referer: headers.referer,
      ...(headers.origin ? { Origin: headers.origin } : {}),
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-App-ID': IG_APP_ID,
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    }
    if (headers.useRange) {
      reqHeaders.Range = 'bytes=0-'
    }

    const response = await fetch(videoUrl, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: reqHeaders,
      redirect: 'follow',
    } as RequestInit)

    if (!response.ok && response.status !== 206) {
      throw new Error(`Video fetch HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > 0 && contentLength > env.MAX_FILE_SIZE_BYTES) {
      throw new Error(`Video exceeds ${env.MAX_FILE_SIZE_MB}MB`)
    }
    if (!response.body) {
      throw new Error('Empty video body')
    }

    const nodeStream = Readable.fromWeb(
      response.body as import('stream/web').ReadableStream<Uint8Array>
    )
    const file = createWriteStream(destPath)
    let written = 0
    nodeStream.on('data', (chunk: Buffer) => {
      written += chunk.length
      if (written > env.MAX_FILE_SIZE_BYTES) {
        nodeStream.destroy(new Error(`Video exceeds ${env.MAX_FILE_SIZE_MB}MB`))
      }
    })
    await pipeline(nodeStream, file)
    return written
  } finally {
    clearTimeout(timer)
  }
}

/** Download Instagram CDN MP4 with mobile/browser headers (no cookies). */
export async function fetchInstagramVideoToFile(
  videoUrl: string,
  postUrl: string,
  destPath: string
): Promise<string> {
  const timeoutMs = Math.min(env.DOWNLOAD_TIMEOUT_MS, 120_000)
  const headerSets = buildHeaderSets(postUrl)
  let lastError: Error | undefined
  let attempts = 0

  for (const candidate of videoUrlCandidates(videoUrl)) {
    for (const headers of headerSets) {
      attempts++
      if (attempts > 24) {
        break
      }
      try {
        const bytes = await tryDownload(candidate, destPath, headers, timeoutMs)
        if (bytes < 80_000 && /\/(reel|tv)\//i.test(postUrl)) {
          throw new Error('Instagram video too small (thumbnail?)')
        }
        logger.info('instagram cdn video ok', {
          url: postUrl,
          bytes,
          referer: headers.referer.slice(0, 60),
          range: headers.useRange,
          ua: headers.userAgent.includes('Instagram') ? 'ig-app' : 'browser',
        })
        return destPath
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  throw lastError ?? new Error('Instagram CDN video fetch failed')
}
