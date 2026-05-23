import { spawn } from 'child_process'
import { killProcessTree } from '@/lib/killProcessTree'
import logger from '@/lib/logger'
import { initYtdlpBinary } from '@/services/ytdlpBinary'
import type { YtDlpFlags, YtDlpMetadata } from '@/services/ytdlpTypes'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dargs = require('dargs')

const activeChildren = new Set<ReturnType<typeof spawn>>()

function flagsToArgs(flags: YtDlpFlags): string[] {
  return dargs(flags, { useEquals: false }).filter(Boolean) as string[]
}

export function getActiveYtdlpCount(): number {
  return activeChildren.size
}

export function killAllYtdlpProcesses(): void {
  for (const child of activeChildren) {
    killProcessTree(child, 'yt-dlp')
  }
  activeChildren.clear()
}

export async function runYtdlpJson(
  url: string,
  flags: YtDlpFlags,
  timeoutMs: number,
  label: string
): Promise<YtDlpMetadata> {
  const binary = await initYtdlpBinary()
  const args = [...flagsToArgs(flags), url]

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C' },
    })
    activeChildren.add(child)

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      killProcessTree(child, label)
      activeChildren.delete(child)
      reject(new Error(`yt-dlp timed out after ${timeoutMs}ms (${label})`))
    }, timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      activeChildren.delete(child)
      reject(new Error(`yt-dlp spawn error: ${err.message}`))
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      activeChildren.delete(child)
      if (code === 0) {
        const trimmed = stdout.trim()
        if (!trimmed) {
          reject(new Error('yt-dlp returned empty output'))
          return
        }
        try {
          resolve(JSON.parse(trimmed) as YtDlpMetadata)
        } catch {
          reject(
            new Error(
              `yt-dlp invalid JSON: ${stderr.slice(0, 200) || trimmed.slice(0, 200)}`
            )
          )
        }
        return
      }
      const detail =
        stderr.trim().slice(0, 600) ||
        stdout.trim().slice(0, 300) ||
        `exit code ${code ?? 'unknown'}`
      logger.error('yt-dlp exited with error', { label, url, code, detail })
      reject(new Error(detail))
    })
  })
}

export function formatYtdlpError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return String(error)
}
