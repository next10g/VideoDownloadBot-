import { ChildProcess } from 'child_process'
import { killProcessTree } from '@/lib/killProcessTree'
import logger from '@/lib/logger'
import { initYtdlpBinary } from '@/services/ytdlpBinary'
import type { YtDlpFlags, YtDlpMetadata } from '@/services/ytdlpTypes'

type YtdlpExec = (
  url: string,
  flags: YtDlpFlags,
  opts?: Record<string, unknown>
) => Promise<YtDlpMetadata> & ChildProcess

let youtubedl: YtdlpExec | undefined

async function getYtdlp(): Promise<YtdlpExec> {
  if (youtubedl) {
    return youtubedl
  }
  const binaryPath = await initYtdlpBinary()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { create } = require('youtube-dl-exec')
  youtubedl = create(binaryPath) as YtdlpExec
  logger.info('yt-dlp binary ready', { path: binaryPath })
  return youtubedl
}

interface YtdlpExecError extends Error {
  stderr?: string
  stdout?: string
  exitCode?: number
}

export function formatYtdlpError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const parts: string[] = []
  if (error.message) {
    parts.push(error.message)
  }
  const extra = error as YtdlpExecError
  if (extra.stderr?.trim()) {
    parts.push(extra.stderr.trim().slice(0, 500))
  }
  if (extra.stdout?.trim() && !extra.stderr) {
    parts.push(extra.stdout.trim().slice(0, 300))
  }
  if (typeof extra.exitCode === 'number') {
    parts.push(`exit=${extra.exitCode}`)
  }
  return parts.filter(Boolean).join(' | ') || 'yt-dlp failed (no output)'
}

const activeRuns = new Map<number, { child: ChildProcess; label: string }>()

function track(subprocess: ChildProcess, label: string): void {
  if (!subprocess.pid) {
    return
  }
  activeRuns.set(subprocess.pid, { child: subprocess, label })
  subprocess.once('exit', () => {
    if (subprocess.pid) {
      activeRuns.delete(subprocess.pid)
    }
  })
}

export function getActiveYtdlpCount(): number {
  return activeRuns.size
}

export function killAllYtdlpProcesses(): void {
  for (const [pid, run] of activeRuns) {
    logger.warn('killing yt-dlp process', { pid, label: run.label })
    killProcessTree(run.child, run.label)
    activeRuns.delete(pid)
  }
}

export async function runYtdlpJson(
  url: string,
  flags: YtDlpFlags,
  timeoutMs: number,
  label: string
): Promise<YtDlpMetadata> {
  const ytdlp = await getYtdlp()
  const subprocess = ytdlp(url, flags, {
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '',
    },
  }) as Promise<YtDlpMetadata> & ChildProcess

  track(subprocess, label)

  const hardTimer = setTimeout(() => {
    logger.error('yt-dlp hard timeout', { label, url, timeoutMs })
    killProcessTree(subprocess, label)
  }, timeoutMs + 5_000)
  hardTimer.unref()

  try {
    return await subprocess
  } catch (error) {
    killProcessTree(subprocess, label)
    const detail = formatYtdlpError(error)
    logger.error('yt-dlp exec failed', { label, url, detail })
    throw new Error(detail)
  } finally {
    clearTimeout(hardTimer)
  }
}
