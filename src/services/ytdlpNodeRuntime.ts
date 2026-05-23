import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { execPath } from 'process'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const execFileAsync = promisify(execFile)

let cachedNodePath: string | undefined
let resolved = false

function nodeCandidates(): string[] {
  return [
    env.YTDLP_NODE_PATH_RESOLVED,
    execPath,
    '/opt/alt/alt-nodejs20/root/usr/bin/node',
    '/opt/alt/alt-nodejs18/root/usr/bin/node',
    'node',
  ].filter((p): p is string => Boolean(p))
}

async function isExecutableNode(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    const { stdout } = await execFileAsync(path, ['--version'], { timeout: 10_000 })
    return /v\d+\./.test(stdout)
  } catch {
    return false
  }
}

export async function resolveNodeForYtdlp(): Promise<string | undefined> {
  if (resolved) {
    return cachedNodePath
  }
  resolved = true
  for (const candidate of nodeCandidates()) {
    if (await isExecutableNode(candidate)) {
      cachedNodePath = candidate
      logger.info('yt-dlp JS runtime (node)', { path: candidate })
      return candidate
    }
  }
  logger.warn(
    'No Node.js for yt-dlp EJS — YouTube may fail. Set YTDLP_NODE_PATH or use Hostinger Node 20'
  )
  return undefined
}

export function getYtdlpJsRuntimesFlag(): string | undefined {
  if (!cachedNodePath) {
    return undefined
  }
  return `node:${cachedNodePath}`
}
