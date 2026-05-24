import { execFile } from 'child_process'
import { copyFile, stat } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { loadSharp } from '@/helpers/sharpLoader'
import { getFfmpegPath } from '@/services/ffmpegPath'
import logger from '@/lib/logger'

const execFileAsync = promisify(execFile)

/** Telegram photo limit is 10 MB; stay under 9 MB after re-encode. */
const TELEGRAM_PHOTO_MAX_BYTES = 9 * 1024 * 1024
const TELEGRAM_MAX_DIMENSION = 4096

function isTelegramReadyImage(path: string, size: number): boolean {
  return (
    /\.(jpe?g|png)$/i.test(path) &&
    size >= 256 &&
    size <= TELEGRAM_PHOTO_MAX_BYTES
  )
}

async function convertWithFfmpeg(
  inputPath: string,
  outputPath: string
): Promise<string> {
  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) {
    throw new Error('ffmpeg not available for image conversion')
  }
  await execFileAsync(
    ffmpeg,
    [
      '-y',
      '-i',
      inputPath,
      '-vf',
      `scale='min(${TELEGRAM_MAX_DIMENSION},iw)':'min(${TELEGRAM_MAX_DIMENSION},ih)':force_original_aspect_ratio=decrease`,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath,
    ],
    { timeout: 90_000 }
  )
  return outputPath
}

/** Convert/resize image so Telegram accepts it (webp → jpeg, fix corrupt payloads). */
export async function prepareTelegramPhoto(
  inputPath: string,
  jobDir?: string
): Promise<string> {
  const inputStat = await stat(inputPath)
  if (inputStat.size < 256) {
    throw new Error('image too small')
  }

  if (isTelegramReadyImage(inputPath, inputStat.size)) {
    return inputPath
  }

  const outputPath = join(
    jobDir || inputPath.replace(/[^/\\]+$/, ''),
    `tg-${inputPath.replace(/^.*[/\\]/, '').replace(/\.\w+$/, '')}.jpg`
  )

  const sharp = await loadSharp()
  if (sharp) {
    try {
      const meta = await sharp(inputPath).metadata()
      const tooLarge =
        inputStat.size > TELEGRAM_PHOTO_MAX_BYTES ||
        (meta.width && meta.width > TELEGRAM_MAX_DIMENSION) ||
        (meta.height && meta.height > TELEGRAM_MAX_DIMENSION)

      let pipeline = sharp(inputPath).rotate()
      if (tooLarge) {
        pipeline = pipeline.resize({
          width: TELEGRAM_MAX_DIMENSION,
          height: TELEGRAM_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
      }
      await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath)
      return outputPath
    } catch (error) {
      logger.warn('prepareTelegramPhoto sharp failed, trying ffmpeg', {
        path: inputPath,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  try {
    return await convertWithFfmpeg(inputPath, outputPath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (/\.webp$/i.test(inputPath)) {
      throw error
    }
    if (isTelegramReadyImage(inputPath, inputStat.size)) {
      logger.warn('prepareTelegramPhoto using original file', {
        path: inputPath,
        detail,
      })
      return inputPath
    }
    if (!getFfmpegPath() && inputStat.size <= TELEGRAM_PHOTO_MAX_BYTES) {
      const fallback = join(
        jobDir || inputPath.replace(/[^/\\]+$/, ''),
        inputPath.replace(/^.*[/\\]/, '')
      )
      if (fallback !== inputPath) {
        await copyFile(inputPath, fallback)
      }
      logger.warn('prepareTelegramPhoto passthrough (no ffmpeg/sharp)', {
        path: inputPath,
      })
      return fallback !== inputPath ? fallback : inputPath
    }
    logger.warn('prepareTelegramPhoto ffmpeg failed', {
      path: inputPath,
      detail,
    })
    throw error
  }
}
