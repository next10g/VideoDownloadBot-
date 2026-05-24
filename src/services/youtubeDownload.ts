import { readdir } from 'fs/promises'
import { basename, dirname } from 'path'
import logger from '@/lib/logger'
import env from '@/helpers/env'
import { downloadInvidiousYoutube, invidiousApiBases } from '@/services/invidiousYoutube'
import { downloadPipedYoutube, pipedApiBases } from '@/services/pipedYoutube'
import {
  useProxyYoutubeApis,
  useYtdlpForYoutube,
  youtubeBackendMode,
} from '@/services/youtubeBackend'
import {
  cookiePoolSize,
  isYoutubeCookiesInvalid,
  pickCookieForJob,
  shouldUseYoutubeCookies,
} from '@/services/ytdlpCookies'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtdlpDownloadResult } from '@/services/ytdlpSpawn'
import { fetchErrorDetail } from '@/services/youtubeStreamDownload'
import {
  buildFlagsForYoutubeStrategy,
  isYoutubeBotBlockMessage,
  youtubeStrategiesNoCookies,
  youtubeStrategiesWithCookies,
  type YoutubeStrategy,
} from '@/services/youtubeStrategies'

const MEDIA_SUFFIXES = ['.mp4', '.webm', '.mkv', '.m4a', '.mp3', '.opus', '.aac', '.flac']

function strategiesForJob(jobId: string): YoutubeStrategy[] {
  const anonymous = youtubeStrategiesNoCookies()
  const cookiePath = pickCookieForJob(jobId)
  const withCookies = cookiePath
    ? youtubeStrategiesWithCookies(cookiePath)
    : []

  if (shouldUseYoutubeCookies() && withCookies.length > 0) {
    return [...withCookies, ...anonymous]
  }

  if (
    env.YOUTUBE_COOKIES_FIRST &&
    env.YOUTUBE_FALLBACK_COOKIES &&
    withCookies.length > 0
  ) {
    return [...withCookies, ...anonymous]
  }

  const list = [...anonymous]
  if (env.YOUTUBE_FALLBACK_COOKIES && withCookies.length > 0) {
    list.push(...withCookies)
  }
  return list
}

async function hasDownloadArtifact(outputBase: string): Promise<boolean> {
  const jobDir = dirname(outputBase)
  const prefix = `${basename(outputBase)}.`
  try {
    const entries = await readdir(jobDir)
    return entries.some((name) => {
      if (!name.startsWith(prefix) || name.endsWith('.part')) {
        return false
      }
      if (name.endsWith('.info.json')) {
        return true
      }
      const lower = name.toLowerCase()
      return MEDIA_SUFFIXES.some((ext) => lower.endsWith(ext))
    })
  } catch {
    return false
  }
}

function isRetryableYoutubeFailure(message: string): boolean {
  const text = message.toLowerCase()
  if (isYoutubeBotBlockMessage(text)) {
    return true
  }
  return (
    text.includes('requested format is not available') ||
    text.includes('no video formats') ||
    text.includes('does not fit filter') ||
    text.includes('login_required')
  )
}

async function runYtdlpYoutubeDownload(
  url: string,
  outputBase: string,
  audio: boolean,
  jobId: string,
  timeoutMs: number
): Promise<YtdlpDownloadResult> {
  const strategies = strategiesForJob(jobId)
  let lastError: Error | undefined

  for (const strategy of strategies) {
    const flags = buildFlagsForYoutubeStrategy(outputBase, audio, strategy)
    try {
      logger.info('youtube yt-dlp strategy', { jobId, strategy: strategy.id })
      const result = await runYtdlpDownload(url, flags, timeoutMs, 'download')
      if (!(await hasDownloadArtifact(outputBase))) {
        lastError = new Error('yt-dlp finished but wrote no media file')
        continue
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = error instanceof Error ? error : new Error(message)
      if (!isRetryableYoutubeFailure(message)) {
        throw lastError
      }
      logger.warn('youtube yt-dlp blocked', { jobId, strategy: strategy.id })
    }
  }

  const detail = lastError?.message ?? ''
  if (isYoutubeCookiesInvalid(detail)) {
    logger.error('cookies.txt expired — use YOUTUBE_BACKEND=auto and no cookies')
  }
  throw lastError ?? new Error('YouTube download failed')
}

/** Public bot: Invidious → Piped → (optional) yt-dlp. No cookies required. */
export async function runYoutubeDownload(
  url: string,
  outputBase: string,
  audio: boolean,
  jobId: string,
  timeoutMs: number,
  options?: { maxHeight?: number }
): Promise<YtdlpDownloadResult> {
  const failures: string[] = []
  const maxHeight = options?.maxHeight

  if (useProxyYoutubeApis()) {
    try {
      logger.info('youtube invidious download', { jobId })
      return await downloadInvidiousYoutube(
        url,
        outputBase,
        audio,
        timeoutMs,
        maxHeight
      )
    } catch (error) {
      const detail = fetchErrorDetail(error)
      failures.push(`invidious: ${detail}`)
      logger.warn('youtube invidious failed', { jobId, detail })
    }

    try {
      logger.info('youtube piped download', { jobId })
      return await downloadPipedYoutube(
        url,
        outputBase,
        audio,
        timeoutMs,
        maxHeight
      )
    } catch (error) {
      const detail = fetchErrorDetail(error)
      failures.push(`piped: ${detail}`)
      logger.warn('youtube piped failed', { jobId, detail })
    }
  }

  if (useYtdlpForYoutube()) {
    logger.info('youtube falling back to yt-dlp', { jobId })
    return runYtdlpYoutubeDownload(url, outputBase, audio, jobId, timeoutMs)
  }

  throw new Error(
    failures.length > 0
      ? `YouTube unavailable (${failures.join(' | ')})`
      : 'YouTube download not configured'
  )
}

export function logYoutubePublicMode(): void {
  const mode = youtubeBackendMode()
  logger.info('YouTube backend', {
    mode,
    flow:
      mode === 'ytdlp'
        ? 'yt-dlp only'
        : mode === 'auto'
          ? 'invidious → piped → yt-dlp'
          : 'invidious → piped',
    pipedApis: pipedApiBases().length,
    invidiousApis: invidiousApiBases().length,
    invidiousCustom: env.INVIDIOUS_API_URLS.length,
    cookiePoolSize: cookiePoolSize(),
    userCooldownSec: env.YOUTUBE_USER_COOLDOWN_SECONDS,
  })
}
