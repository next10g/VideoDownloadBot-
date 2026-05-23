import logger from '@/lib/logger'
import env from '@/helpers/env'
import { pickCookieForJob, shouldUseYoutubeCookies } from '@/services/ytdlpCookies'
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
  const list = [...youtubeStrategiesNoCookies()]
  if (shouldUseYoutubeCookies()) {
    const cookiePath = pickCookieForJob(jobId)
    if (cookiePath) {
      list.push(...youtubeStrategiesWithCookies(cookiePath))
    }
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
  if (shouldUseYoutubeCookies()) {
    logger.info('YouTube mode: optional cookies/pool enabled (admin)')
    return
  }
  logger.info('YouTube mode: public (no cookies)', {
    poToken: Boolean(env.YTDLP_YOUTUBE_PO_TOKEN.trim()),
    userCooldownSec: env.YOUTUBE_USER_COOLDOWN_SECONDS,
  })
}
