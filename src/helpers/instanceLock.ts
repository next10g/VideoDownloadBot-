import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { TEMP_ROOT } from '@/helpers/tempDir'
import logger from '@/lib/logger'

const LOCK_FILE = join(TEMP_ROOT, 'bot-instance.lock')

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

/**
 * Ensures only one bot process binds the webhook on shared hosting.
 * Returns false if another live instance holds the lock (caller should exit quietly).
 */
export async function acquireInstanceLock(): Promise<boolean> {
  await mkdir(TEMP_ROOT, { recursive: true })
  try {
    const raw = await readFile(LOCK_FILE, 'utf8')
    const otherPid = Number.parseInt(raw.trim(), 10)
    if (
      Number.isFinite(otherPid) &&
      otherPid !== process.pid &&
      isProcessAlive(otherPid)
    ) {
      logger.warn('another bot instance already running — exiting duplicate', {
        otherPid,
        thisPid: process.pid,
      })
      return false
    }
  } catch {
    // no lock or stale lock
  }
  await writeFile(LOCK_FILE, String(process.pid), { flag: 'w' })
  return true
}

export async function releaseInstanceLock(): Promise<void> {
  try {
    const raw = await readFile(LOCK_FILE, 'utf8')
    if (Number.parseInt(raw.trim(), 10) === process.pid) {
      await unlink(LOCK_FILE)
    }
  } catch {
    // ignore
  }
}
