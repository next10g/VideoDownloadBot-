import { readdir } from 'fs/promises'
import { basename, dirname } from 'path'
import logger from '@/lib/logger'
import env from '@/helpers/env'
import {
  cookiePoolSize,
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

export async function runYoutubeDownload(
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
      logger.info('youtube strategy attempt', { jobId, strategy: strategy.id })
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
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : ''
      lastError = error instanceof Error ? error : new Error(message)
      if (!isRetryableYoutubeFailure(message, stderr)) {
        throw lastError
      }
      logger.warn('youtube strategy blocked', { jobId, strategy: strategy.id })
    }
  }

  throw lastError ?? new Error('YouTube download failed')
}

export function logYoutubePublicMode(): void {
  const pool = cookiePoolSize()
  const poToken = Boolean(env.YTDLP_YOUTUBE_PO_TOKEN.trim())
  if (shouldUseYoutubeCookies()) {
    logger.info('YouTube mode: cookies first', { pool, poToken })
    return
  }
  logger.info('YouTube mode: public', {
    cookiesFirst: env.YOUTUBE_COOKIES_FIRST && pool > 0,
    fallbackCookies: env.YOUTUBE_FALLBACK_COOKIES && pool > 0,
    cookiePoolSize: pool,
    poToken,
    userCooldownSec: env.YOUTUBE_USER_COOLDOWN_SECONDS,
  })
}
