import env from '@/helpers/env'
import logger from '@/lib/logger'

let initialized = false

/** Raise undici connect timeout (Node default 10s breaks on slow shared hosting). */
export function initYoutubeFetchAgent(): void {
  if (initialized) {
    return
  }
  initialized = true
  const timeoutMs = env.PIPED_API_TIMEOUT_MS
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undici = require('node:undici') as {
      Agent: new (opts: Record<string, number>) => unknown
      setGlobalDispatcher: (d: unknown) => void
    }
    const { Agent, setGlobalDispatcher } = undici
    setGlobalDispatcher(
      new Agent({
        connectTimeout: timeoutMs,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      })
    )
    logger.info('youtube fetch agent', { connectTimeoutMs: timeoutMs })
  } catch (error) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const undici = require('undici') as {
        Agent: new (opts: Record<string, number>) => unknown
        setGlobalDispatcher: (d: unknown) => void
      }
      const { Agent, setGlobalDispatcher } = undici
      setGlobalDispatcher(
        new Agent({
          connectTimeout: timeoutMs,
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs,
        })
      )
      logger.info('youtube fetch agent', { connectTimeoutMs: timeoutMs })
    } catch (inner) {
      logger.warn('youtube fetch agent not configured', {
        detail:
          inner instanceof Error ? inner.message : String(inner),
        cause: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
