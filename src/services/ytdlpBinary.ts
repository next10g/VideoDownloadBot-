import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import env from '@/helpers/env'

const CANDIDATE_PATHS = [
  () => env.YTDLP_PATH_RESOLVED,
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

export async function resolveYtdlpPath(): Promise<string> {
  if (cachedPath) {
    return cachedPath
  }
  for (const getPath of CANDIDATE_PATHS) {
    const candidate = getPath()
    if (!candidate) {
      continue
    }
    try {
      await access(candidate, fsConstants.F_OK)
      cachedPath = candidate
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error(
    'yt-dlp binary not found. Run node scripts/ensure-ytdlp.js or set YTDLP_PATH in .env'
  )
}

export function getCachedYtdlpPath(): string | undefined {
  return cachedPath
}

export async function initYtdlpBinary(): Promise<string> {
  const path = await resolveYtdlpPath()
  if (!env.isDevelopment) {
    const { chmod } = await import('fs/promises')
    try {
      await chmod(path, 0o755)
    } catch {
      // ignore
    }
  }
  return path
}
