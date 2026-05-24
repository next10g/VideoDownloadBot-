import env from '@/helpers/env'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import logger from '@/lib/logger'
import { ValidationError } from '@/lib/errors'
import {
  probeFacebookEmbed,
  type FacebookEmbedResult,
} from '@/services/facebookEmbed'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

export interface MediaFormatOffer {
  title: string
  description?: string
  /** Available video heights (p), sorted high → low. Empty = no video. */
  videoHeights: number[]
  hasImage: boolean
  hasAudio: boolean
  facebook?: FacebookEmbedResult
}

function parseHeightFromFormat(format: Record<string, unknown>): number {
  const h = Number(format.height ?? 0)
  if (h > 0) {
    return h
  }
  const res = String(format.resolution || format.format_note || '')
  const match = res.match(/(\d{3,4})/)
  return match ? Number(match[1]) : 0
}

function heightsFromYtdlp(meta: YtDlpMetadata): {
  heights: number[]
  hasAudio: boolean
  hasImage: boolean
} {
  const formats = (meta as YtDlpMetadata & { formats?: Record<string, unknown>[] })
    .formats
  if (!formats?.length) {
    const h = Number((meta as { height?: number }).height ?? 0)
    const hasVideo = meta.ext && !/^jpe?g|png|webp|gif$/i.test(meta.ext)
    return {
      heights: h > 0 ? [h] : hasVideo ? [720] : [],
      hasAudio: /^m4a|mp3|opus|aac$/i.test(meta.ext || ''),
      hasImage: /^jpe?g|png|webp|gif$/i.test(meta.ext || ''),
    }
  }

  const heights = new Set<number>()
  let hasAudio = false
  let hasImage = false

  for (const f of formats) {
    const vcodec = String(f.vcodec || '')
    const acodec = String(f.acodec || '')
    const ext = String(f.ext || '')
    if (vcodec !== 'none' && vcodec !== '') {
      const h = parseHeightFromFormat(f)
      if (h > 0) {
        heights.add(h)
      }
    }
    if (acodec !== 'none' && acodec !== '' && vcodec === 'none') {
      hasAudio = true
    }
    if (/^jpe?g|png|webp|gif$/i.test(ext)) {
      hasImage = true
    }
  }

  return {
    heights: [...heights].sort((a, b) => b - a).filter((h) => h <= env.YOUTUBE_MAX_HEIGHT),
    hasAudio,
    hasImage,
  }
}

function offerFromFacebook(embed: FacebookEmbedResult): MediaFormatOffer {
  const heights = embed.streams.map((s) => s.height).filter((h) => h > 0)
  const unique = [...new Set(heights)].sort((a, b) => b - a)
  return {
    title: embed.title || 'Facebook',
    description: embed.description,
    videoHeights: unique,
    hasImage: Boolean(embed.imageUrl),
    hasAudio: unique.length > 0,
    facebook: embed,
  }
}

function offerFromYtdlp(meta: YtDlpMetadata): MediaFormatOffer {
  const { heights, hasAudio, hasImage } = heightsFromYtdlp(meta)
  return {
    title: meta.title || 'Video',
    description: meta.description,
    videoHeights: heights,
    hasImage,
    hasAudio: hasAudio || Boolean(meta.ext?.match(/m4a|mp3|opus/i)),
  }
}

/** Probe link and decide which download buttons to show (no cookies). */
export async function probeMediaOffer(url: string): Promise<MediaFormatOffer> {
  if (isFacebookUrl(url)) {
    const embed = await probeFacebookEmbed(url, env.PIPED_API_TIMEOUT_MS)
    if (embed && (embed.streams.length > 0 || embed.imageUrl)) {
      return offerFromFacebook(embed)
    }
    logger.warn('facebook embed empty, trying yt-dlp probe', { url })
  }

  try {
    const raw = await runYtdlpJson(
      url,
      buildProbeFlags(),
      env.YTDLP_PROBE_TIMEOUT_MS,
      'probe'
    )
    const meta = raw as YtDlpMetadata
    if (meta._type === 'playlist' && meta.entries?.[0]) {
      return offerFromYtdlp(meta.entries[0])
    }
    return offerFromYtdlp(meta)
  } catch (error) {
    if (isFacebookUrl(url)) {
      throw new ValidationError(
        'Facebook link could not be read from this server (try a public post or Reel link)',
        'facebook_failed'
      )
    }
    throw error
  }
}
