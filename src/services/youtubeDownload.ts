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

function strategiesForJob(jobId: string): YoutubeStrategy[] {
  const anonymous = youtubeStrategiesNoCookies()
  const cookiePath = pickCookieForJob(jobId)
  const withCookies = cookiePath
    ? youtubeStrategiesWithCookies(cookiePath)
    : []

  if (shouldUseYoutubeCookies() && withCookies.length > 0) {
    return [...withCookies, ...anonymous]
  }

  const list = [...anonymous]
  if (env.YOUTUBE_FALLBACK_COOKIES && withCookies.length > 0) {
    list.push(...withCookies)
  }
  return list
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
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lastError = error instanceof Error ? error : new Error(message)
      if (!isYoutubeBotBlockMessage(message)) {
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
    anonymousFirst: true,
    fallbackCookies: env.YOUTUBE_FALLBACK_COOKIES && pool > 0,
    cookiePoolSize: pool,
    poToken,
    userCooldownSec: env.YOUTUBE_USER_COOLDOWN_SECONDS,
  })
}
