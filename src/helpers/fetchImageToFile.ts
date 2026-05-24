import { writeFile } from 'fs/promises'
import env from '@/helpers/env'

export async function fetchImageToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(45_000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
    },
  })
  if (!res.ok) {
    throw new Error(`fetch ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > env.MAX_FILE_SIZE_BYTES) {
    throw new Error('image too large')
  }
  await writeFile(dest, buf)
}
