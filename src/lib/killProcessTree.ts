import { ChildProcess, spawn } from 'child_process'
import logger from '@/lib/logger'

export function killProcessTree(
  child: ChildProcess | undefined,
  label = 'process'
): void {
  if (!child?.pid) {
    return
  }
  const { pid } = child
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' })
    } catch (error) {
      logger.warn('taskkill failed', { label, pid, error: String(error) })
    }
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      logger.warn('kill failed', { label, pid, error: String(error) })
    }
  }
}
