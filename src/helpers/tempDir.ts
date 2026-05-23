import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/** Hostinger/shared hosting: use system temp only (typically /tmp). */
export const TEMP_ROOT = join(tmpdir(), 'video-download-bot')

export async function createJobTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(TEMP_ROOT, `${prefix}-`))
}

export async function removePathSafe(path: string | undefined): Promise<void> {
  if (!path) {
    return
  }
  try {
    await rm(path, { force: true, recursive: true })
  } catch {
    // Best-effort cleanup; avoid throwing during finally blocks.
  }
}
