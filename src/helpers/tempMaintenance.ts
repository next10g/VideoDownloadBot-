import { readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { TEMP_ROOT } from '@/helpers/tempDir'

export async function sweepStaleTempDirs(): Promise<number> {
  let removed = 0
  const now = Date.now()
  try {
    const entries = await readdir(TEMP_ROOT, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const fullPath = join(TEMP_ROOT, entry.name)
      try {
        const info = await stat(fullPath)
        if (now - info.mtimeMs > env.TEMP_MAX_AGE_MS) {
          await rm(fullPath, { recursive: true, force: true })
          removed++
        }
      } catch {
        // ignore per-entry failures
      }
    }
  } catch (error) {
    logger.warn('temp sweep failed', { error: String(error) })
  }
  if (removed > 0) {
    logger.info('temp sweep removed stale dirs', { removed })
  }
  return removed
}

export function startTempMaintenance(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void sweepStaleTempDirs()
  }, env.TEMP_CLEANUP_INTERVAL_MS)
  timer.unref()
  return timer
}
