import { access, readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import env from '@/helpers/env'
import { isLowMemoryMode } from '@/helpers/lowMemory'
import { loadSharp } from '@/helpers/sharpLoader'
import { removePathSafe } from '@/helpers/tempDir'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

const THUMB_MAX_BYTES = 200 * 1024
const REMOTE_THUMB_MAX_BYTES = 2 * 1024 * 1024

export default async function getThumbnailUrl(
  downloadedFileInfo: YtDlpMetadata,
  jobDir: string,
  fileBase: string,
  fileSizeBytes: number
): Promise<string | undefined> {
  if (env.SKIP_THUMBNAILS) {
    return undefined
  }

  const localThumb = await findLocalThumbnail(jobDir, fileBase)
  if (localThumb) {
    return resizeThumb(localThumb, jobDir, fileSizeBytes)
  }

  if (isLowMemoryMode(fileSizeBytes)) {
    return undefined
  }

  let thumbnailUrl = ''
  for (const thumbnail of downloadedFileInfo.thumbnails?.reverse() || []) {
    if (thumbnail.height && thumbnail.width && thumbnail.url) {
      thumbnailUrl = thumbnail.url
      break
    }
  }
  if (!thumbnailUrl) {
    return undefined
  }

  const downloadedPath = join(jobDir, `${fileBase}-remote-thumb`)
  try {
    const response = await fetch(thumbnailUrl, {
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      return undefined
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > REMOTE_THUMB_MAX_BYTES) {
      return undefined
    }
    await writeFile(downloadedPath, buffer)
    return resizeThumb(downloadedPath, jobDir, fileSizeBytes)
  } catch {
    await removePathSafe(downloadedPath)
    return undefined
  }
}

async function findLocalThumbnail(
  jobDir: string,
  fileBase: string
): Promise<string | undefined> {
  const candidates = [
    `${fileBase}.jpg`,
    `${fileBase}.webp`,
    `${fileBase}.png`,
    `${fileBase}.image.jpg`,
  ]
  for (const name of candidates) {
    try {
      await access(join(jobDir, name))
      return join(jobDir, name)
    } catch {
      // try next
    }
  }
  try {
    const files = await readdir(jobDir)
    const thumb = files.find(
      (f) =>
        f.startsWith(fileBase) &&
        /\.(jpe?g|webp|png)$/i.test(f) &&
        !f.endsWith('.info.json')
    )
    return thumb ? join(jobDir, thumb) : undefined
  } catch {
    return undefined
  }
}

async function resizeThumb(
  inputPath: string,
  jobDir: string,
  fileSizeBytes: number
): Promise<string | undefined> {
  try {
    const input = await readFile(inputPath)
    if (input.byteLength <= THUMB_MAX_BYTES) {
      return inputPath
    }
  } catch {
    return undefined
  }

  if (isLowMemoryMode(fileSizeBytes)) {
    return undefined
  }

  const sharp = await loadSharp()
  if (!sharp) {
    return inputPath
  }

  const outputPath = join(jobDir, 'thumb-telegram.jpg')
  try {
    await sharp(inputPath)
      .resize({
        width: 320,
        height: 320,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath)
    return outputPath
  } catch {
    return inputPath
  }
}
