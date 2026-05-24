import { isBenignTelegramError } from '@/helpers/telegramErrors'
import logger from '@/lib/logger'
import { killAllYtdlpProcesses } from '@/services/ytdlpSpawn'
import { sweepStaleTempDirs } from '@/helpers/tempMaintenance'

const startedAt = Date.now()
let watchdogTimer: NodeJS.Timeout | undefined

export function getProcessStartedAt(): number {
  return startedAt
}

export function registerProcessLifecycle(): void {
  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    void gracefulCleanup('uncaughtException').finally(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason) => {
    if (isBenignTelegramError(reason)) {
      return
    }
    logger.error('unhandledRejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })

  watchdogTimer = setInterval(() => {
    const mem = process.memoryUsage()
    logger.info('watchdog', {
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    })
  }, 60_000)
  watchdogTimer.unref()
}

export async function gracefulCleanup(reason: string): Promise<void> {
  logger.warn('graceful cleanup', { reason })
  killAllYtdlpProcesses()
  try {
    await sweepStaleTempDirs()
  } catch (error) {
    logger.warn('temp sweep during cleanup failed', { error: String(error) })
  }
}

export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = undefined
  }
}
