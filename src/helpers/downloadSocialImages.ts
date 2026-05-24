import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Download image URLs to disk (no ZIP). */
export async function downloadImagesToDir(
  urls: string[],
  jobDir: string
): Promise<string[]> {
  const limited = urls.slice(0, env.ALBUM_MAX_IMAGES)
  const paths: string[] = []

  for (let i = 0; i < limited.length; i++) {
    const dest = join(jobDir, `img${i + 1}.jpg`)
    try {
      await fetchImageToFile(limited[i], dest)
      paths.push(dest)
    } catch (error) {
      logger.warn('social image skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (paths.length === 0) {
    throw new Error('No images downloaded')
  }
  return paths
}
