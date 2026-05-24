import env from '@/helpers/env'
import { createFetchAgent, loadUndici } from '@/helpers/loadUndici'
import logger from '@/lib/logger'

let initialized = false

/** Raise undici connect timeout (Node default 10s breaks on slow shared hosting). */
export function initYoutubeFetchAgent(): void {
  if (initialized) {
    return
  }
  initialized = true
  const timeoutMs = env.PIPED_API_TIMEOUT_MS
  const undici = loadUndici()
  if (!undici?.setGlobalDispatcher) {
    logger.warn('youtube fetch agent not configured', {
      detail: 'npm package undici missing — run npm install',
    })
    return
  }
  undici.setGlobalDispatcher(
    createFetchAgent(timeoutMs) ??
      new undici.Agent({
        connectTimeout: timeoutMs,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      })
  )
  logger.info('youtube fetch agent', { connectTimeoutMs: timeoutMs })
}
