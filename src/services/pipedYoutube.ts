import { createWriteStream } from 'fs'
import { writeFile } from 'fs/promises'
import { extname } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import env from '@/helpers/env'
import { extractYoutubeVideoId } from '@/helpers/youtubeVideoId'
import { ValidationError } from '@/lib/errors'
import logger from '@/lib/logger'
import { validateMetadata } from '@/services/ytdlpProbe'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import type { YtdlpDownloadResult } from '@/services/ytdlpSpawn'

interface PipedStreamItem {
  url: string
  format?: string
  quality: string
  mimeType?: string
  videoOnly?: boolean
  bitrate?: number
  contentLength?: number
}

interface PipedStreamsResponse {
  title?: string
  duration?: number
  thumbnailUrl?: string
  livestream?: boolean
  videoStreams?: PipedStreamItem[]
  audioStreams?: PipedStreamItem[]
}

const DEFAULT_PIPED_APIS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.privacydev.net',
]

function pipedApiBases(): string[] {
  const custom = env.PIPED_API_URLS
  return custom.length > 0 ? custom : DEFAULT_PIPED_APIS
}

function parseHeight(quality: string): number {
  const match = quality.match(/(\d{3,4})/)
  return match ? Number(match[1]) : 0
}

function streamSize(item: PipedStreamItem): number {
  return item.contentLength ?? 0
}

function fitsLimits(item: PipedStreamItem, audio: boolean): boolean {
  const size = streamSize(item)
  if (size > 0 && size > env.MAX_FILE_SIZE_BYTES) {
    return false
  }
  if (!audio) {
    const height = parseHeight(item.quality)
    if (height > env.YOUTUBE_MAX_HEIGHT) {
      return false
    }
  }
  return true
}

function pickAudioStream(streams: PipedStreamItem[]): PipedStreamItem {
  const candidates = streams.filter((s) => fitsLimits(s, true))
  if (candidates.length === 0) {
    throw new Error('No suitable Piped audio stream under size limit')
  }
  candidates.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  return candidates[0]
}

function pickVideoStream(streams: PipedStreamItem[]): PipedStreamItem {
  let candidates = streams.filter((s) => !s.videoOnly && fitsLimits(s, false))
  if (candidates.length === 0) {
    candidates = streams.filter((s) => fitsLimits(s, false))
  }
  if (candidates.length === 0) {
    throw new Error('No suitable Piped video stream under size/height limit')
  }
  candidates.sort((a, b) => {
    const h = parseHeight(b.quality) - parseHeight(a.quality)
    if (h !== 0) {
      return h
    }
    const mp4 =
      Number(/mp4|mpeg/i.test(b.mimeType || b.format || '')) -
      Number(/mp4|mpeg/i.test(a.mimeType || a.format || ''))
    if (mp4 !== 0) {
      return mp4
    }
    return streamSize(a) - streamSize(b)
  })
  return candidates[0]
}

async function fetchPipedStreams(videoId: string): Promise<PipedStreamsResponse> {
  let lastError: Error | undefined
  for (const base of pipedApiBases()) {
    const apiUrl = `${base.replace(/\/$/, '')}/streams/${videoId}`
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), env.PIPED_API_TIMEOUT_MS)
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'VideoDownloadBot/1.0' },
      })
      clearTimeout(timer)
      if (!response.ok) {
        throw new Error(`Piped API ${response.status} at ${base}`)
      }
      const data = (await response.json()) as PipedStreamsResponse
      logger.info('piped streams ok', { base, videoId, title: data.title })
      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('piped api failed', { base, videoId, detail: lastError.message })
    }
  }
  throw lastError ?? new Error('All Piped API instances failed')
}

async function downloadStreamToFile(
  streamUrl: string,
  destPath: string,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(streamUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'VideoDownloadBot/1.0' },
    })
    if (!response.ok) {
      throw new Error(`Stream download HTTP ${response.status}`)
    }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > env.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Stream exceeds ${env.MAX_FILE_SIZE_MB}MB (Content-Length ${contentLength})`
      )
    }
    if (!response.body) {
      throw new Error('Empty stream body')
    }

    const nodeStream = Readable.fromWeb(
      response.body as import('stream/web').ReadableStream<Uint8Array>
    )
    const file = createWriteStream(destPath)
    let written = 0
    nodeStream.on('data', (chunk: Buffer) => {
      written += chunk.length
      if (written > env.MAX_FILE_SIZE_BYTES) {
        nodeStream.destroy(new Error(`Download exceeds ${env.MAX_FILE_SIZE_MB}MB`))
      }
    })
    await pipeline(nodeStream, file)
  } finally {
    clearTimeout(timer)
  }
}

function toMetadata(data: PipedStreamsResponse, ext: string): YtDlpMetadata {
  return {
    title: data.title,
    duration: data.duration,
    extractor: 'youtube',
    extractor_key: 'Youtube',
    ext,
    is_live: data.livestream === true,
    live_status: data.livestream ? 'is_live' : undefined,
  }
}

export async function probePipedYoutube(url: string): Promise<YtDlpMetadata> {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new ValidationError('Invalid YouTube URL', 'unsupported')
  }
  const data = await fetchPipedStreams(videoId)
  if (data.livestream) {
    throw new ValidationError('Live streams are not supported', 'livestream')
  }
  const meta = toMetadata(data, 'mp4')
  validateMetadata(meta, url)
  return meta
}

export async function downloadPipedYoutube(
  url: string,
  outputBase: string,
  audio: boolean,
  timeoutMs: number
): Promise<YtdlpDownloadResult> {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  const data = await fetchPipedStreams(videoId)
  if (data.livestream) {
    throw new Error('Live streams are not supported')
  }

  const stream = audio
    ? pickAudioStream(data.audioStreams ?? [])
    : pickVideoStream(data.videoStreams ?? [])

  const ext = audio
    ? extname(new URL(stream.url).pathname) || '.m4a'
    : '.mp4'
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
  const destPath = `${outputBase}${normalizedExt}`

  logger.info('piped download stream', {
    videoId,
    quality: stream.quality,
    videoOnly: stream.videoOnly,
    audio,
  })

  await downloadStreamToFile(stream.url, destPath, timeoutMs)

  const meta = toMetadata(data, normalizedExt.replace(/^\./, ''))
  await writeFile(`${outputBase}.info.json`, JSON.stringify(meta), 'utf8')

  return { stderr: '' }
}
