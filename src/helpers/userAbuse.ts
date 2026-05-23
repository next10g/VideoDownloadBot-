import env from '@/helpers/env'
import logger from '@/lib/logger'

interface UserRecord {
  failures: number
  blockedUntil: number
  retryAttempts: number
  lastRetryAt: number
}

const users = new Map<number, UserRecord>()

function getRecord(chatId: number): UserRecord {
  let record = users.get(chatId)
  if (!record) {
    record = { failures: 0, blockedUntil: 0, retryAttempts: 0, lastRetryAt: 0 }
    users.set(chatId, record)
  }
  return record
}

export function isUserBlocked(chatId: number): boolean {
  const record = getRecord(chatId)
  if (record.blockedUntil > Date.now()) {
    return true
  }
  if (record.blockedUntil > 0 && record.blockedUntil <= Date.now()) {
    record.blockedUntil = 0
    record.failures = 0
    record.retryAttempts = 0
  }
  return false
}

export function blockRemainingMinutes(chatId: number): number {
  const record = getRecord(chatId)
  if (record.blockedUntil <= Date.now()) {
    return 0
  }
  return Math.ceil((record.blockedUntil - Date.now()) / 60_000)
}

export function recordDownloadFailure(chatId: number): void {
  const record = getRecord(chatId)
  record.failures++
  if (record.failures >= env.USER_FAILURE_BLOCK_THRESHOLD) {
    record.blockedUntil = Date.now() + env.USER_BLOCK_MINUTES * 60_000
    record.failures = 0
    logger.warn('user temporarily blocked', { chatId, minutes: env.USER_BLOCK_MINUTES })
  }
}

export function recordDownloadSuccess(chatId: number): void {
  const record = getRecord(chatId)
  record.failures = 0
  record.retryAttempts = 0
}

/** Returns true if retry spam detected (caller should reject). */
export function registerRetryAttempt(chatId: number): boolean {
  const record = getRecord(chatId)
  const now = Date.now()
  if (now - record.lastRetryAt < 3_000) {
    record.retryAttempts++
  } else {
    record.retryAttempts = 1
  }
  record.lastRetryAt = now
  return record.retryAttempts > 5
}
