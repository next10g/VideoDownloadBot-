import { writeFile } from 'fs/promises'
import env from '@/helpers/env'

export interface ImageFetchHeaders {
  referer?: string
  userAgent?: string
}

function extFromContentType(ct: string | null): string {
  if (!ct) {
    return '.jpg'
  }
  const lower = ct.toLowerCase()
  if (lower.includes('webp')) {
    return '.webp'
  }
  if (lower.includes('png')) {
    return '.png'
  }
  if (lower.includes('jpeg') || lower.includes('jpg')) {
    return '.jpg'
  }
  return '.jpg'
}

function sniffExt(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    return '.jpg'
  }
  if (buf.length >= 8 && buf.toString('ascii', 0, 4) === 'RIFF') {
    return '.webp'
  }
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50) {
    return '.png'
  }
  return '.jpg'
}

/** Download image; returns path written (extension matches real format). */
export async function fetchImageToFile(
  url: string,
  dest: string,
  headers?: ImageFetchHeaders
): Promise<string> {
  const referer = headers?.referer ?? 'https://www.instagram.com/'
  const userAgent =
    headers?.userAgent ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  const res = await fetch(url, {
    signal: AbortSignal.timeout(45_000),
    headers: {
      'User-Agent': userAgent,
      Referer: referer,
      Origin: 'https://www.instagram.com',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    },
  })
  if (!res.ok) {
    throw new Error(`fetch ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 256) {
    throw new Error('image too small')
  }
  if (buf.length > env.MAX_FILE_SIZE_BYTES) {
    throw new Error('image too large')
  }

  const ext = extFromContentType(res.headers.get('content-type')) || sniffExt(buf)
  const base = dest.replace(/\.[^.]+$/, '')
  const finalPath = `${base}${ext}`
  await writeFile(finalPath, buf)
  return finalPath
}
