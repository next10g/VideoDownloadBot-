import { access, chmod, mkdir } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { dirname, join } from 'path'
import { cwd } from 'process'
import { tmpdir } from 'os'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const execFileAsync = promisify(execFile)

const YTDLP_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

let cachedPath: string | undefined

export function projectYtdlpPath(): string {
  return join(cwd(), 'bin', 'yt-dlp')
}

export function clearYtdlpPathCache(): void {
  cachedPath = undefined
}

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/** True only if the binary can actually be executed (not just present on disk). */
export async function isYtdlpRunnable(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false
  }
  await tryChmodExecutable(filePath)
  try {
    await execFileAsync(filePath, ['--version'], { timeout: 15_000 })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('yt-dlp not runnable', { path: filePath, error: message })
    return false
  }
}

function nodeModulesYtdlpPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const constants = require('youtube-dl-exec/src/constants')
    return constants.YOUTUBE_DL_PATH as string
  } catch {
    return undefined
  }
}

function getCandidates(): string[] {
  const custom = env.YTDLP_PATH_RESOLVED
  const list = [
    projectYtdlpPath(),
    custom,
    nodeModulesYtdlpPath(),
    join(tmpdir(), 'yt-dlp'),
    '/tmp/yt-dlp',
  ].filter((p): p is string => Boolean(p))
  return [...new Set(list)]
}

export async function downloadYtdlpTo(dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  logger.info('Downloading yt-dlp', { dest })
  await execFileAsync(
    'curl',
    ['-fsSL', YTDLP_URL, '-o', dest],
    { timeout: 120_000 }
  )
  await tryChmodExecutable(dest)
}

export async function resolveYtdlpPath(): Promise<string> {
  if (cachedPath && (await isYtdlpRunnable(cachedPath))) {
    return cachedPath
  }
  cachedPath = undefined

  const custom = env.YTDLP_PATH_RESOLVED
  const projectBin = projectYtdlpPath()

  for (const candidate of getCandidates()) {
    if (!(await isYtdlpRunnable(candidate))) {
      continue
    }
    if (
      custom &&
      (custom === '/tmp/yt-dlp' || custom.startsWith('/tmp/')) &&
      candidate !== custom
    ) {
      logger.warn(
        'YTDLP_PATH points at /tmp but that path is not executable on this host; using project binary instead',
        { configured: custom, using: candidate }
      )
    }
    cachedPath = candidate
    return candidate
  }

  if (!(await fileExists(projectBin))) {
    try {
      await downloadYtdlpTo(projectBin)
    } catch (error) {
      throw new Error(
        `Failed to download yt-dlp to ${projectBin}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  if (!(await isYtdlpRunnable(projectBin))) {
    throw new Error(
      `yt-dlp at ${projectBin} is not executable. On Hostinger: unset YTDLP_PATH=/tmp/yt-dlp, run "node scripts/ensure-ytdlp.js", then "chmod +x bin/yt-dlp"`
    )
  }

  cachedPath = projectBin
  return projectBin
}

export function getCachedYtdlpPath(): string | undefined {
  return cachedPath
}

export async function initYtdlpBinary(): Promise<string> {
  const filePath = await resolveYtdlpPath()
  logger.info('yt-dlp binary', { path: filePath })
  return filePath
}
