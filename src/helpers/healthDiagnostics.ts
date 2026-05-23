import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import downloadQueue from '@/helpers/downloadQueue'
import env from '@/helpers/env'
import { TEMP_ROOT } from '@/helpers/tempDir'
import { metrics, MetricsSnapshot } from '@/lib/metrics'
import { getProcessStartedAt } from '@/lib/processLifecycle'
import { getActiveYtdlpCount } from '@/services/ytdlpRunner'

export interface HealthDiagnostics {
  status: 'ok'
  uptimeSec: number
  environment: string
  memory: NodeJS.MemoryUsage
  queue: ReturnType<typeof downloadQueue.getStats>
  metrics: MetricsSnapshot
  ytdlpActive: number
  temp: {
    root: string
    dirCount: number
    oldestDirAgeSec: number | null
  }
  limits: {
    maxFileSizeMb: number
    maxDurationSeconds: number
    maxUserActiveJobs: number
  }
}

async function getTempStats(): Promise<HealthDiagnostics['temp']> {
  const result = {
    root: TEMP_ROOT,
    dirCount: 0,
    oldestDirAgeSec: null as number | null,
  }
  try {
    const entries = await readdir(TEMP_ROOT, { withFileTypes: true })
    const now = Date.now()
    let oldestAge = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      result.dirCount++
      try {
        const info = await stat(join(TEMP_ROOT, entry.name))
        const ageSec = Math.floor((now - info.mtimeMs) / 1000)
        oldestAge = Math.max(oldestAge, ageSec)
      } catch {
        // skip
      }
    }
    result.oldestDirAgeSec = result.dirCount > 0 ? oldestAge : null
  } catch {
    // temp root may not exist yet
  }
  return result
}

export async function collectHealthDiagnostics(): Promise<HealthDiagnostics> {
  return {
    status: 'ok',
    uptimeSec: Math.floor((Date.now() - getProcessStartedAt()) / 1000),
    environment: env.ENVIRONMENT,
    memory: process.memoryUsage(),
    queue: downloadQueue.getStats(),
    metrics: metrics.snapshot(),
    ytdlpActive: getActiveYtdlpCount(),
    temp: await getTempStats(),
    limits: {
      maxFileSizeMb: env.MAX_FILE_SIZE_MB,
      maxDurationSeconds: env.MAX_DURATION_SECONDS,
      maxUserActiveJobs: env.MAX_USER_ACTIVE_JOBS,
    },
  }
}
