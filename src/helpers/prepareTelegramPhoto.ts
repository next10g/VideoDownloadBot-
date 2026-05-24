import { stat } from 'fs/promises'
import { join } from 'path'
import { loadSharp } from '@/helpers/sharpLoader'
import logger from '@/lib/logger'

/** Telegram photo limit is 10 MB; stay under 9 MB after re-encode. */
const TELEGRAM_PHOTO_MAX_BYTES = 9 * 1024 * 1024
const TELEGRAM_MAX_DIMENSION = 4096

/** Convert/resize image so Telegram accepts it (webp → jpeg, fix corrupt/HTML payloads). */
export async function prepareTelegramPhoto(
  inputPath: string,
  jobDir?: string
): Promise<string> {
  const inputStat = await stat(inputPath)
  if (inputStat.size < 256) {
    throw new Error('image too small')
  }

  const sharp = await loadSharp()
  if (!sharp) {
    return inputPath
  }

  const outputPath = join(
    jobDir || inputPath.replace(/[^/\\]+$/, ''),
    `tg-${inputPath.replace(/^.*[/\\]/, '').replace(/\.\w+$/, '')}.jpg`
  )

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
    logger.warn('prepareTelegramPhoto failed', {
      path: inputPath,
      detail: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
