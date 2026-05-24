import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import env from '@/helpers/env'
import { createFetchAgent } from '@/helpers/loadUndici'
import logger from '@/lib/logger'

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
}

const HEADER_SETS: HeaderSet[] = [
  { referer: 'https://www.instagram.com/', userAgent: IG_ANDROID_UA, origin: 'https://www.instagram.com' },
  { referer: 'https://www.instagram.com/', userAgent: IG_IPHONE_UA, origin: 'https://www.instagram.com' },
  { referer: 'https://www.instagram.com/', userAgent: IG_DESKTOP_UA, origin: 'https://www.instagram.com' },
]

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
  postUrl: string,
  headers: HeaderSet,
  timeoutMs: number
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = createFetchAgent(timeoutMs)
    const response = await fetch(videoUrl, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'User-Agent': headers.userAgent,
        Referer: headers.referer,
        ...(headers.origin ? { Origin: headers.origin } : {}),
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Range: 'bytes=0-',
        'Sec-Fetch-Dest': 'video',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      redirect: 'follow',
    } as RequestInit)

    if (!response.ok && response.status !== 206) {
      throw new Error(`Video fetch HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > env.MAX_FILE_SIZE_BYTES) {
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
  const timeoutMs = env.DOWNLOAD_TIMEOUT_MS
  let lastError: Error | undefined

  for (const candidate of videoUrlCandidates(videoUrl)) {
    for (const headers of HEADER_SETS) {
      try {
        const bytes = await tryDownload(candidate, destPath, postUrl, headers, timeoutMs)
        if (bytes < 80_000 && /\/(reel|tv)\//i.test(postUrl)) {
          throw new Error('Instagram video too small (thumbnail?)')
        }
        logger.info('instagram cdn video ok', {
          url: postUrl,
          bytes,
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
