import env from '@/helpers/env'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { ValidationError } from '@/lib/errors'
import logger from '@/lib/logger'
import { probeInvidiousYoutube } from '@/services/invidiousYoutube'
import { probePipedYoutube } from '@/services/pipedYoutube'
import { useProxyYoutubeApis } from '@/services/youtubeBackend'
import { isYoutubeBotBlock } from '@/services/ytdlpCookies'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { validationErrorFromYtdlp } from '@/helpers/ytdlpValidation'
import { formatYtdlpError, runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

function normalizeMetadata(raw: YtDlpMetadata): YtDlpMetadata {
  if (raw._type === 'playlist' && raw.entries?.length === 1) {
    return raw.entries[0] || raw
  }
  return raw
}

export function validateMetadata(meta: YtDlpMetadata, url: string): void {
  if (meta._type === 'playlist' || (meta.entries && meta.entries.length > 1)) {
    throw new ValidationError('Playlists are not supported', 'playlist')
  }

  if (
    meta.is_live === true ||
    meta.live_status === 'is_live' ||
    meta.live_status === 'is_upcoming'
  ) {
    throw new ValidationError('Live streams are not supported', 'livestream')
  }

  const duration = meta.duration ?? 0
  if (duration > env.MAX_DURATION_SECONDS) {
    throw new ValidationError(
      `Video exceeds max duration (${env.MAX_DURATION_SECONDS}s)`,
      'duration_too_long'
    )
  }

  const size = meta.filesize ?? meta.filesize_approx ?? 0
  if (size > env.MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      `Video exceeds max size (${env.MAX_FILE_SIZE_MB}MB)`,
      'file_too_large'
    )
  }

  const extractor = meta.extractor || meta.extractor_key || ''
  if (
    extractor &&
    env.DISALLOWED_EXTRACTORS.some(
      (blocked) => blocked.toLowerCase() === extractor.toLowerCase()
    )
  ) {
    throw new ValidationError(`Extractor not allowed: ${extractor}`, 'unsupported')
  }
  if (
    extractor &&
    env.SUSPICIOUS_EXTRACTORS.some(
      (s) => s.toLowerCase() === extractor.toLowerCase()
    )
  ) {
    logger.warn('suspicious extractor blocked', { extractor, url })
    throw new ValidationError(
      'This source is temporarily restricted',
      'suspicious_extractor'
    )
  }
}

export async function probeUrlMetadata(url: string): Promise<YtDlpMetadata> {
  if (isYoutubeUrl(url) && useProxyYoutubeApis()) {
    try {
      return await probeInvidiousYoutube(url)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      logger.warn('invidious probe failed', {
        url,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      return await probePipedYoutube(url)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      logger.warn('piped probe failed, trying yt-dlp', {
        url,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    const raw = await runYtdlpJson(
      url,
      buildProbeFlags(url),
      env.YTDLP_PROBE_TIMEOUT_MS,
      'probe'
    )
    const meta = normalizeMetadata(raw)
    validateMetadata(meta, url)
    return meta
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error
    }
    const message = formatYtdlpError(error)
    const mapped = validationErrorFromYtdlp(message)
    if (mapped) {
      throw mapped
    }
    if (message.includes('Unsupported URL')) {
      throw new ValidationError(message, 'unsupported')
    }
    if (message.includes('No video formats')) {
      throw new ValidationError(message, 'unsupported')
    }
    if (isYoutubeBotBlock(message)) {
      throw new ValidationError('YouTube bot check on server', 'youtube_bot')
    }
    logger.warn('yt-dlp probe failed', { url, detail: message })
    throw new ValidationError(
      message.length > 20
        ? `Could not inspect link: ${message.slice(0, 200)}`
        : 'Could not inspect this link (yt-dlp failed on server)',
      'probe_failed'
    )
  }
}
