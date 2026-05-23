import env from '@/helpers/env'
import { ValidationError } from '@/lib/errors'
import { normalizeUrl } from '@/services/urlNormalize'

export function assertValidUrlShape(url: string): void {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError('Only HTTP(S) links are supported', 'invalid_url')
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error
    }
    throw new ValidationError('Invalid URL', 'invalid_url')
  }
}

function assertNotBlacklisted(url: string): void {
  if (!env.BLACKLIST_DOMAINS.length) {
    return
  }
  const host = new URL(url).hostname.toLowerCase()
  for (const domain of env.BLACKLIST_DOMAINS) {
    const blocked = domain.toLowerCase()
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      throw new ValidationError(
        'This domain is not allowed',
        'blacklist'
      )
    }
  }
}

const DIRECT_MEDIA = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|ogg|wav)(\?|$)/i

export async function preflightUrl(rawUrl: string): Promise<string> {
  const url = normalizeUrl(rawUrl)
  assertValidUrlShape(url)
  assertNotBlacklisted(url)

  if (!DIRECT_MEDIA.test(url)) {
    return url
  }
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return url
    }
    const lengthHeader = response.headers.get('content-length')
    if (!lengthHeader) {
      return url
    }
    const bytes = Number.parseInt(lengthHeader, 10)
    if (Number.isFinite(bytes) && bytes > env.MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File exceeds ${env.MAX_FILE_SIZE_MB}MB (Content-Length)`,
        'file_too_large'
      )
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error
    }
  }
  return url
}
