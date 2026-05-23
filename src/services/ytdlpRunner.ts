import { ChildProcess } from 'child_process'
import { killProcessTree } from '@/lib/killProcessTree'
import logger from '@/lib/logger'
import type { YtDlpFlags, YtDlpMetadata } from '@/services/ytdlpTypes'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const youtubedl = require('youtube-dl-exec').create('/tmp/yt-dlp')

type YtdlpSubprocess = Promise<YtDlpMetadata> & ChildProcess

interface ActiveRun {
  child: ChildProcess
  label: string
}

const activeRuns = new Map<number, ActiveRun>()

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
  const subprocess = youtubedl(url, flags, {
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    detached: process.platform !== 'win32',
  }) as YtdlpSubprocess

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
    throw error
  } finally {
    clearTimeout(hardTimer)
  }
}