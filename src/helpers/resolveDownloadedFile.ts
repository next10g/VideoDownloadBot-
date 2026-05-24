import { readdir, stat } from 'fs/promises'
import { join } from 'path'

const MEDIA_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mkv',
  '.mov',
  '.m4a',
  '.mp3',
  '.opus',
  '.aac',
  '.flac',
]

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.webp', '.png', '.gif']

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isMediaFile(name: string, allowImages: boolean): boolean {
  if (name.endsWith('.part') || name.endsWith('.info.json')) {
    return false
  }
  if (isImageFile(name)) {
    return allowImages
  }
  return MEDIA_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

/** Pick best file when yt-dlp writes DASH video+audio separately (no ffmpeg). */
async function pickBestAmong(
  jobDir: string,
  names: string[]
): Promise<string | undefined> {
  if (names.length === 0) {
    return undefined
  }
  if (names.length === 1) {
    return join(jobDir, names[0])
  }

  const mp4s = names.filter((n) => n.toLowerCase().endsWith('.mp4'))
  if (mp4s.length > 0) {
    const progressive = mp4s.filter(
      (n) => !/\.f[a-z0-9]+-/i.test(n) && !n.includes('.fdash')
    )
    const pool = progressive.length > 0 ? progressive : mp4s
    let best = pool[0]
    let bestSize = await fileSize(join(jobDir, best))
    for (const name of pool.slice(1)) {
      const size = await fileSize(join(jobDir, name))
      if (size > bestSize) {
        best = name
        bestSize = size
      }
    }
    return join(jobDir, best)
  }

  let best = names[0]
  let bestSize = await fileSize(join(jobDir, best))
  for (const name of names.slice(1)) {
    const size = await fileSize(join(jobDir, name))
    if (size > bestSize) {
      best = name
      bestSize = size
    }
  }
  return join(jobDir, best)
}

export async function findDownloadedMediaFile(
  jobDir: string,
  fileBase: string,
  allowImages: boolean
): Promise<string | undefined> {
  const entries = await readdir(jobDir)
  const prefixed = entries.filter(
    (name) =>
      name.startsWith(`${fileBase}.`) && isMediaFile(name, allowImages)
  )
  if (prefixed.length > 0) {
    return pickBestAmong(jobDir, prefixed)
  }
  const any = entries.filter((n) => isMediaFile(n, allowImages))
  return pickBestAmong(jobDir, any)
}

export async function resolveDownloadedMediaPath(
  jobDir: string,
  fileBase: string,
  allowImages: boolean,
  hintedPath?: string
): Promise<string> {
  if (hintedPath) {
    try {
      await stat(hintedPath)
      return hintedPath
    } catch {
      // fall through
    }
  }
  const found = await findDownloadedMediaFile(jobDir, fileBase, allowImages)
  if (found) {
    return found
  }

  const entries = await readdir(jobDir)
  const media = entries.find(
    (name) =>
      /\.(mp4|mkv|webm|mov|m4a|mp3|opus|aac|flac|jpg|jpeg|png|webp|gif)$/i.test(
        name
      ) && !name.endsWith('.info.json') && !name.endsWith('.part')
  )
  if (media) {
    return join(jobDir, media)
  }

  throw new Error('Could not resolve downloaded file path')
}
