import { GrammyError } from 'grammy'
import logger from '@/lib/logger'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof GrammyError)) {
    return undefined
  }
  if (error.error_code !== 429) {
    return undefined
  }
  const retry = error.parameters?.retry_after
  return typeof retry === 'number' && retry > 0 ? retry : 1
}

/** Retry Telegram API calls when Hostinger starts several Node processes at once. */
export async function withTelegramRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const waitSec = retryAfterSeconds(error)
      if (!waitSec || attempt >= maxAttempts) {
        throw error
      }
      const waitMs = (waitSec + 0.5) * 1000
      logger.warn('telegram rate limit — retrying', {
        label,
        attempt,
        waitSec,
      })
      await sleep(waitMs)
    }
  }
  throw lastError
}
