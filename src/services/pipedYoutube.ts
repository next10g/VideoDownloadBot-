import { writeFile } from 'fs/promises'
import env from '@/helpers/env'
import { resolveMaxHeight } from '@/helpers/resolveMaxHeight'
import { mergeApiBases } from '@/helpers/normalizeApiUrl'
import { extractYoutubeVideoId } from '@/helpers/youtubeVideoId'
import { ValidationError } from '@/lib/errors'
import logger from '@/lib/logger'
import { validateMetadata } from '@/services/ytdlpProbe'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import type { YtdlpDownloadResult } from '@/services/ytdlpSpawn'
import {
  downloadStreamToFile,
  fetchErrorDetail,
  fetchJson,
  parseByteSize,
  parseHeightLabel,
} from '@/services/youtubeStreamDownload'

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

/** Public Piped API mirrors (rotate on failure). */
const DEFAULT_PIPED_APIS = [
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://api-piped.mha.fi',
  'https://piped-api.lunar.icu',
  'https://pipedapi.kavin.rocks',
]

export function pipedApiBases(): string[] {
  return mergeApiBases(env.PIPED_API_URLS, DEFAULT_PIPED_APIS)
}

function streamSize(item: PipedStreamItem): number {
  return item.contentLength ?? 0
}

function fitsLimits(
  item: PipedStreamItem,
  audio: boolean,
  maxHeight: number
): boolean {
  const size = streamSize(item)
  if (size > 0 && size > env.MAX_FILE_SIZE_BYTES) {
    return false
  }
  if (!audio) {
    const height = parseHeightLabel(item.quality)
    if (height > maxHeight) {
      return false
    }
  }
  return true
}

function pickAudioStream(
  streams: PipedStreamItem[],
  maxHeight: number
): PipedStreamItem {
  const candidates = streams.filter((s) => fitsLimits(s, true, maxHeight))
  if (candidates.length === 0) {
    throw new Error('No suitable Piped audio stream under size limit')
  }
  candidates.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  return candidates[0]
}

function pickVideoStream(
  streams: PipedStreamItem[],
  maxHeight: number
): PipedStreamItem {
  let candidates = streams.filter(
    (s) => !s.videoOnly && fitsLimits(s, false, maxHeight)
  )
  if (candidates.length === 0) {
    candidates = streams.filter((s) => fitsLimits(s, false, maxHeight))
  }
  if (candidates.length === 0) {
    throw new Error('No suitable Piped video stream under size/height limit')
  }
  candidates.sort((a, b) => {
    const h = parseHeightLabel(b.quality) - parseHeightLabel(a.quality)
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
      const data = await fetchJson<PipedStreamsResponse>(
        apiUrl,
        `Piped ${base}`,
        env.PIPED_API_TIMEOUT_MS
      )
      logger.info('piped streams ok', { base, videoId, title: data.title })
      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('piped api failed', {
        base,
        videoId,
        detail: fetchErrorDetail(error),
      })
    }
  }
  throw lastError ?? new Error('All Piped API instances failed')
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
  timeoutMs: number,
  maxHeight?: number
): Promise<YtdlpDownloadResult> {
  const heightLimit = resolveMaxHeight(maxHeight)
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  const data = await fetchPipedStreams(videoId)
  if (data.livestream) {
    throw new Error('Live streams are not supported')
  }

  const stream = audio
    ? pickAudioStream(data.audioStreams ?? [], heightLimit)
    : pickVideoStream(data.videoStreams ?? [], heightLimit)

  const ext = audio ? '.m4a' : '.mp4'
  const destPath = `${outputBase}${ext}`

  logger.info('piped download stream', {
    videoId,
    quality: stream.quality,
    videoOnly: stream.videoOnly,
    audio,
  })

  await downloadStreamToFile(stream.url, destPath, timeoutMs)

  const meta = toMetadata(data, ext.replace(/^\./, ''))
  await writeFile(`${outputBase}.info.json`, JSON.stringify(meta), 'utf8')

  return { stderr: '' }
}
