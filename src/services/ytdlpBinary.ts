import { access, chmod } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { join } from 'path'
import { cwd } from 'process'
import { tmpdir } from 'os'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const CANDIDATE_PATHS = [
  () => env.YTDLP_PATH_RESOLVED,
  () => join(cwd(), 'bin', 'yt-dlp'),
  () => join(tmpdir(), 'yt-dlp'),
  () => '/tmp/yt-dlp',
  () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const constants = require('youtube-dl-exec/src/constants')
      return constants.YOUTUBE_DL_PATH as string
    } catch {
      return undefined
    }
  },
]

let cachedPath: string | undefined

async function tryChmodExecutable(filePath: string): Promise<void> {
  try {
    await chmod(filePath, 0o755)
  } catch (error) {
    logger.warn('yt-dlp chmod failed', {
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveYtdlpPath(): Promise<string> {
  if (cachedPath) {
    return cachedPath
  }
  for (const getPath of CANDIDATE_PATHS) {
    const candidate = getPath()
    if (!candidate) {
      continue
    }
    if (await canAccess(candidate)) {
      await tryChmodExecutable(candidate)
      cachedPath = candidate
      return candidate
    }
  }
  throw new Error(
    'yt-dlp binary not found. Run: node scripts/ensure-ytdlp.js — prefer bin/yt-dlp in project folder'
  )
}

export function getCachedYtdlpPath(): string | undefined {
  return cachedPath
}

export async function initYtdlpBinary(): Promise<string> {
  const filePath = await resolveYtdlpPath()
  logger.info('yt-dlp binary', { path: filePath })
  return filePath
}
