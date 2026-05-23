import { access, chmod, mkdir, rm, stat, unlink } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { dirname, join } from 'path'
import { cwd, platform } from 'process'
import { tmpdir } from 'os'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const execFileAsync = promisify(execFile)

function releaseAssetName(): string {
  if (platform === 'win32') return 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

function ytdlpDownloadUrl(): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${releaseAssetName()}`
}

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

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch {
    return false
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
  if (!(await isRegularFile(filePath))) {
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

async function prepareDest(dest: string): Promise<void> {
  if (!(await fileExists(dest))) {
    return
  }
  try {
    const info = await stat(dest)
    if (info.isDirectory()) {
      logger.warn('Removing bin/yt-dlp directory; replacing with standalone binary', {
        path: dest,
      })
      await rm(dest, { recursive: true, force: true })
      return
    }
    if (!(await isYtdlpRunnable(dest))) {
      logger.warn('Removing broken yt-dlp file', { path: dest })
      await unlink(dest)
    }
  } catch (error) {
    logger.warn('prepareDest failed', {
      path: dest,
      error: error instanceof Error ? error.message : String(error),
    })
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
  await prepareDest(dest)
  await mkdir(dirname(dest), { recursive: true })
  const url = ytdlpDownloadUrl()
  logger.info('Downloading standalone yt-dlp', { dest, asset: releaseAssetName(), url })
  await execFileAsync('curl', ['-fsSL', url, '-o', dest], { timeout: 120_000 })
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

  await downloadYtdlpTo(projectBin)

  if (!(await isYtdlpRunnable(projectBin))) {
    throw new Error(
      `yt-dlp at ${projectBin} is not executable. On SSH run: bash scripts/install-ytdlp.sh`
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
