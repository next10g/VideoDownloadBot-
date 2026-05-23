import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { cwd } from 'process'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const execFileAsync = promisify(execFile)

let cachedPath: string | undefined
let initialized = false

function candidates(): string[] {
  const list = [
    env.FFMPEG_PATH_RESOLVED,
    join(cwd(), 'bin', 'ffmpeg'),
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ]
  return list.filter((p): p is string => Boolean(p))
}

async function isRunnable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    await execFileAsync(path, ['-version'], { timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

export async function resolveFfmpegPath(): Promise<string | undefined> {
  if (initialized) {
    return cachedPath
  }
  initialized = true
  for (const candidate of candidates()) {
    if (await isRunnable(candidate)) {
      cachedPath = candidate
      logger.info('ffmpeg found', { path: candidate })
      return candidate
    }
  }
  logger.warn(
    'ffmpeg not found — skipping merge/thumbnail conversion (set FFMPEG_PATH or add bin/ffmpeg)'
  )
  return undefined
}

export function getFfmpegPath(): string | undefined {
  return cachedPath
}
