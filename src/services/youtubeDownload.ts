import { readdir } from 'fs/promises'
import { basename, dirname } from 'path'
import logger from '@/lib/logger'
import env from '@/helpers/env'
import { downloadPipedYoutube } from '@/services/pipedYoutube'
import {
  usePipedForYoutube,
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

function isRetryableYoutubeFailure(message: string, stderr: string): boolean {
  const text = `${message}\n${stderr}`.toLowerCase()
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
        logger.warn('youtube strategy produced no file', {
          jobId,
          strategy: strategy.id,
          stderr: result.stderr.slice(0, 300),
        })
        lastError = new Error(
          result.stderr.trim() || 'yt-dlp finished but wrote no media file'
        )
        continue
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = error instanceof Error ? error : new Error(message)
      if (!isRetryableYoutubeFailure(message, '')) {
        throw lastError
      }
      logger.warn('youtube yt-dlp blocked', { jobId, strategy: strategy.id })
    }
  }

  const detail = lastError?.message ?? ''
  if (isYoutubeCookiesInvalid(detail)) {
    logger.error(
      'cookies.txt expired — not needed if YOUTUBE_BACKEND=piped. See docs/YOUTUBE-PUBLIC-BOT.md'
    )
  }
  throw lastError ?? new Error('YouTube download failed')
}

/** YouTube for public bots: Piped API (no cookies) with optional yt-dlp fallback. */
export async function runYoutubeDownload(
  url: string,
  outputBase: string,
  audio: boolean,
  jobId: string,
  timeoutMs: number
): Promise<YtdlpDownloadResult> {
  if (usePipedForYoutube()) {
    try {
      logger.info('youtube piped download', { jobId })
      return await downloadPipedYoutube(url, outputBase, audio, timeoutMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('youtube piped failed', { jobId, detail: message })
      if (!useYtdlpForYoutube()) {
        throw error instanceof Error ? error : new Error(message)
      }
      logger.info('youtube falling back to yt-dlp', { jobId })
    }
  }

  return runYtdlpYoutubeDownload(url, outputBase, audio, jobId, timeoutMs)
}

export function logYoutubePublicMode(): void {
  const mode = youtubeBackendMode()
  const pool = cookiePoolSize()
  logger.info('YouTube backend', {
    mode,
    pipedApis: env.PIPED_API_URLS.length || 'default list',
    maxHeight: env.YOUTUBE_MAX_HEIGHT,
    cookiePoolSize: pool,
    cookiesEnabled:
      env.YOUTUBE_FALLBACK_COOKIES || env.YOUTUBE_USE_COOKIES,
    userCooldownSec: env.YOUTUBE_USER_COOLDOWN_SECONDS,
  })
}
