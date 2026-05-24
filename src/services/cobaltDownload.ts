import { join } from 'path'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import env from '@/helpers/env'
import { mergeApiBases, normalizeApiUrl } from '@/helpers/normalizeApiUrl'
import { downloadStreamToFile } from '@/services/youtubeStreamDownload'
import logger from '@/lib/logger'

const DEFAULT_COBALT_APIS = [
  'https://cobalt.meowing.de',
  'https://cobalt.stean.su',
  'https://cobalt.duckdns.org',
]

interface CobaltPickerItem {
  type: string
  url: string
}

interface CobaltResponse {
  status: string
  url?: string
  picker?: CobaltPickerItem[]
  error?: { code?: string }
}

export function cobaltApiBases(): string[] {
  return mergeApiBases(env.COBALT_API_URLS, DEFAULT_COBALT_APIS)
}

export function cobaltEnabled(): boolean {
  return env.COBALT_ENABLED && cobaltApiBases().length > 0
}

export function logCobaltMode(): void {
  if (!cobaltEnabled()) {
    logger.info('Cobalt backend', { enabled: false })
    return
  }
  logger.info('Cobalt backend', {
    enabled: true,
    apis: cobaltApiBases().length,
    hasApiKey: Boolean(env.COBALT_API_KEY),
    flow: 'cobalt → embed/graphql → yt-dlp',
  })
}

async function requestCobalt(
  pageUrl: string,
  base: string
): Promise<CobaltResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (env.COBALT_API_KEY) {
    headers.Authorization = `Api-Key ${env.COBALT_API_KEY}`
  }

  const res = await fetch(`${normalizeApiUrl(base)}/`, {
    method: 'POST',
    signal: AbortSignal.timeout(env.COBALT_TIMEOUT_MS),
    headers,
    body: JSON.stringify({
      url: pageUrl,
      downloadMode: 'auto',
      videoQuality: '1080',
      filenameStyle: 'basic',
      alwaysProxy: true,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Cobalt HTTP ${res.status}: ${text.slice(0, 120)}`)
  }

  let data: CobaltResponse
  try {
    data = JSON.parse(text) as CobaltResponse
  } catch {
    throw new Error('Cobalt invalid JSON')
  }

  if (data.status === 'error') {
    throw new Error(data.error?.code || 'Cobalt error')
  }

  return data
}

async function saveCobaltUrl(streamUrl: string, destPath: string, referer: string): Promise<void> {
  if (streamUrl.includes('/tunnel')) {
    const res = await fetch(streamUrl, {
      signal: AbortSignal.timeout(env.DOWNLOAD_TIMEOUT_MS),
      headers: { Accept: '*/*' },
      redirect: 'follow',
    })
    if (!res.ok || !res.body) {
      throw new Error(`Cobalt tunnel HTTP ${res.status}`)
    }
    const nodeStream = Readable.fromWeb(
      res.body as import('stream/web').ReadableStream<Uint8Array>
    )
    const file = createWriteStream(destPath)
    let written = 0
    nodeStream.on('data', (chunk: Buffer) => {
      written += chunk.length
      if (written > env.MAX_FILE_SIZE_BYTES) {
        nodeStream.destroy(new Error('Cobalt file too large'))
      }
    })
    await pipeline(nodeStream, file)
    return
  }

  await downloadStreamToFile(streamUrl, destPath, env.DOWNLOAD_TIMEOUT_MS, referer)
}

/** Download single video via public Cobalt API (no cookies). */
export async function downloadVideoViaCobalt(
  pageUrl: string,
  destPath: string
): Promise<string> {
  if (!cobaltEnabled()) {
    throw new Error('Cobalt disabled')
  }

  let lastError: Error | undefined
  for (const base of cobaltApiBases()) {
    try {
      const data = await requestCobalt(pageUrl, base)
      if (data.status === 'picker') {
        const video = data.picker?.find((p) => p.type === 'video')
        if (!video?.url) {
          throw new Error('Cobalt picker has no video')
        }
        await saveCobaltUrl(video.url, destPath, pageUrl)
      } else if (data.url) {
        await saveCobaltUrl(data.url, destPath, pageUrl)
      } else {
        throw new Error(`Cobalt status ${data.status}`)
      }
      logger.info('cobalt video ok', { url: pageUrl, base })
      return destPath
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('cobalt api failed', {
        base,
        url: pageUrl,
        detail: lastError.message.slice(0, 160),
      })
    }
  }

  throw lastError ?? new Error('All Cobalt APIs failed')
}

/** Instagram/Facebook carousel via Cobalt picker (photos). */
export async function downloadCarouselViaCobalt(
  pageUrl: string,
  jobDir: string
): Promise<string[]> {
  if (!cobaltEnabled()) {
    return []
  }

  const { fetchImageToFile } = await import('@/helpers/fetchImageToFile')
  const { prepareTelegramPhoto } = await import('@/helpers/prepareTelegramPhoto')

  for (const base of cobaltApiBases()) {
    try {
      const data = await requestCobalt(pageUrl, base)
      if (data.status !== 'picker' || !data.picker?.length) {
        continue
      }
      const items = data.picker.filter((p) => p.type === 'photo' || p.type === 'image')
      const paths: string[] = []
      const limit = Math.min(items.length, env.ALBUM_MAX_IMAGES)
      for (let i = 0; i < limit; i++) {
        const dest = join(jobDir, `slide${String(i + 1).padStart(2, '0')}.jpg`)
        const downloaded = await fetchImageToFile(items[i].url, dest, {
          referer: pageUrl,
        })
        paths.push(await prepareTelegramPhoto(downloaded, jobDir))
      }
      if (paths.length > 0) {
        logger.info('cobalt carousel ok', { url: pageUrl, base, count: paths.length })
        return paths
      }
    } catch (error) {
      logger.warn('cobalt carousel failed', {
        base,
        url: pageUrl,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return []
}
