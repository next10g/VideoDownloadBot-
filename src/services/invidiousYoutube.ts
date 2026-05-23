import { writeFile } from 'fs/promises'
import env from '@/helpers/env'
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

interface InvidiousFormat {
  url: string
  quality?: string
  qualityLabel?: string
  type?: string
  container?: string
  size?: string | number
  resolution?: string
}

interface InvidiousVideo {
  title?: string
  lengthSeconds?: number
  liveNow?: boolean
  formatStreams?: InvidiousFormat[]
  adaptiveFormats?: InvidiousFormat[]
}

const DEFAULT_INVIDIOUS_APIS = [
  'https://invidious.fdn.fr',
  'https://yewtu.be',
  'https://invidious.protokolla.fi',
  'https://iv.ggtyler.dev',
  'https://inv.tux.pizza',
  'https://invidious.private.coffee',
  'https://inv.nadeko.net',
]

export function invidiousApiBases(): string[] {
  return mergeApiBases(env.INVIDIOUS_API_URLS, DEFAULT_INVIDIOUS_APIS)
}

function fitsSize(size: number): boolean {
  return size <= 0 || size <= env.MAX_FILE_SIZE_BYTES
}

function pickInvidiousAudio(formats: InvidiousFormat[]): InvidiousFormat {
  const candidates = formats.filter((f) => {
    const type = (f.type || '').toLowerCase()
    if (!type.includes('audio')) {
      return false
    }
    return fitsSize(parseByteSize(f.size))
  })
  if (candidates.length === 0) {
    throw new Error('No suitable Invidious audio stream')
  }
  candidates.sort(
    (a, b) => parseByteSize(b.size) - parseByteSize(a.size)
  )
  return candidates[0]
}

function pickInvidiousVideo(
  formatStreams: InvidiousFormat[],
  adaptiveFormats: InvidiousFormat[]
): InvidiousFormat {
  let candidates = formatStreams.filter((f) => {
    const height = parseHeightLabel(f.quality || f.qualityLabel || '')
    return (
      fitsSize(parseByteSize(f.size)) &&
      height <= env.YOUTUBE_MAX_HEIGHT &&
      /mp4|mpeg/i.test(f.container || f.type || '')
    )
  })
  if (candidates.length === 0) {
    candidates = adaptiveFormats.filter((f) => {
      const type = (f.type || '').toLowerCase()
      if (!type.includes('video')) {
        return false
      }
      const height = parseHeightLabel(
        f.qualityLabel || f.resolution || f.quality || ''
      )
      return fitsSize(parseByteSize(f.size)) && height <= env.YOUTUBE_MAX_HEIGHT
    })
  }
  if (candidates.length === 0) {
    throw new Error('No suitable Invidious video stream')
  }
  candidates.sort((a, b) => {
    const h =
      parseHeightLabel(b.quality || b.qualityLabel || b.resolution || '') -
      parseHeightLabel(a.quality || a.qualityLabel || a.resolution || '')
    if (h !== 0) {
      return h
    }
    return parseByteSize(a.size) - parseByteSize(b.size)
  })
  return candidates[0]
}

async function fetchInvidiousVideo(videoId: string): Promise<InvidiousVideo> {
  let lastError: Error | undefined
  for (const base of invidiousApiBases()) {
    const apiUrl = `${base.replace(/\/$/, '')}/api/v1/videos/${videoId}`
    try {
      const data = await fetchJson<InvidiousVideo>(
        apiUrl,
        `Invidious ${base}`,
        env.PIPED_API_TIMEOUT_MS
      )
      logger.info('invidious video ok', { base, videoId, title: data.title })
      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('invidious api failed', {
        base,
        videoId,
        detail: fetchErrorDetail(error),
      })
    }
  }
  throw lastError ?? new Error('All Invidious API instances failed')
}

function toMetadata(data: InvidiousVideo, ext: string): YtDlpMetadata {
  return {
    title: data.title,
    duration: data.lengthSeconds,
    extractor: 'youtube',
    extractor_key: 'Youtube',
    ext,
    is_live: data.liveNow === true,
    live_status: data.liveNow ? 'is_live' : undefined,
  }
}

export async function probeInvidiousYoutube(url: string): Promise<YtDlpMetadata> {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new ValidationError('Invalid YouTube URL', 'unsupported')
  }
  const data = await fetchInvidiousVideo(videoId)
  if (data.liveNow) {
    throw new ValidationError('Live streams are not supported', 'livestream')
  }
  const meta = toMetadata(data, 'mp4')
  validateMetadata(meta, url)
  return meta
}

export async function downloadInvidiousYoutube(
  url: string,
  outputBase: string,
  audio: boolean,
  timeoutMs: number
): Promise<YtdlpDownloadResult> {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  const data = await fetchInvidiousVideo(videoId)
  if (data.liveNow) {
    throw new Error('Live streams are not supported')
  }

  const stream = audio
    ? pickInvidiousAudio(data.adaptiveFormats ?? [])
    : pickInvidiousVideo(
        data.formatStreams ?? [],
        data.adaptiveFormats ?? []
      )

  const ext = audio ? '.m4a' : '.mp4'
  const destPath = `${outputBase}${ext}`

  logger.info('invidious download stream', {
    videoId,
    quality: stream.quality || stream.qualityLabel,
    audio,
  })

  await downloadStreamToFile(stream.url, destPath, timeoutMs)

  const meta = toMetadata(data, ext.replace(/^\./, ''))
  await writeFile(`${outputBase}.info.json`, JSON.stringify(meta), 'utf8')

  return { stderr: '' }
}
