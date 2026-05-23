import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Node fetch uses undici; default connect timeout is 10s (too short on shared hosting). */
function fetchDispatcher(timeoutMs: number): unknown | undefined {
  try {
    const { Agent } = require('undici') as {
      Agent: new (opts: {
        connectTimeout: number
        headersTimeout: number
        bodyTimeout: number
      }) => unknown
    }
    return new Agent({
      connectTimeout: timeoutMs,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    })
  } catch {
    return undefined
  }
}

export function fetchErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error && cause.message) {
    return `${error.message} (${cause.message})`
  }
  return error.message
}

export async function fetchJson<T>(
  url: string,
  label: string,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = fetchDispatcher(timeoutMs)
    const response = await fetch(url, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloadBot/1.0)',
      },
      redirect: 'follow',
    } as RequestInit)
    if (!response.ok) {
      throw new Error(`${label} HTTP ${response.status}`)
    }
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    if (
      contentType.includes('text/html') ||
      text.trimStart().startsWith('<!DOCTYPE') ||
      text.trimStart().startsWith('<html')
    ) {
      throw new Error(`${label} returned HTML (blocked or wrong URL)`)
    }
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`${label} invalid JSON: ${text.slice(0, 80)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadStreamToFile(
  streamUrl: string,
  destPath: string,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const dispatcher = fetchDispatcher(timeoutMs)
    const response = await fetch(streamUrl, {
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloadBot/1.0)',
        Referer: 'https://www.youtube.com/',
      },
      redirect: 'follow',
    } as RequestInit)
    if (!response.ok) {
      throw new Error(`Stream download HTTP ${response.status}`)
    }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > env.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Stream exceeds ${env.MAX_FILE_SIZE_MB}MB (Content-Length ${contentLength})`
      )
    }
    if (!response.body) {
      throw new Error('Empty stream body')
    }

    const nodeStream = Readable.fromWeb(
      response.body as import('stream/web').ReadableStream<Uint8Array>
    )
    const file = createWriteStream(destPath)
    let written = 0
    nodeStream.on('data', (chunk: Buffer) => {
      written += chunk.length
      if (written > env.MAX_FILE_SIZE_BYTES) {
        nodeStream.destroy(new Error(`Download exceeds ${env.MAX_FILE_SIZE_MB}MB`))
      }
    })
    await pipeline(nodeStream, file)
    logger.info('stream saved', { destPath, bytes: written })
  } finally {
    clearTimeout(timer)
  }
}

export function parseHeightLabel(label: string): number {
  const match = label.match(/(\d{3,4})/)
  return match ? Number(match[1]) : 0
}

export function parseByteSize(value: string | number | undefined): number {
  if (value === undefined) {
    return 0
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
