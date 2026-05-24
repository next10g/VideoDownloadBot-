import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { filterSocialImageUrls } from '@/helpers/filterSocialImageUrls'
import {
  downloadInstagramCdnImage,
  downloadInstagramPostImages,
  shouldUseInstagramDownloaders,
} from '@/helpers/instagramImageDownload'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Download image URLs to disk (no ZIP). */
export async function downloadImagesToDir(
  urls: string[],
  jobDir: string,
  postUrl?: string
): Promise<string[]> {
  const filtered = filterSocialImageUrls(urls, postUrl)
  const limited = filtered.slice(0, env.ALBUM_MAX_IMAGES)
  const paths: string[] = []
  const useIg = Boolean(postUrl && shouldUseInstagramDownloaders(postUrl))

  for (let i = 0; i < limited.length; i++) {
    const dest = join(jobDir, `img${i + 1}.jpg`)
    try {
      const downloaded = useIg
        ? await downloadInstagramCdnImage(
            limited[i],
            postUrl!,
            dest,
            jobDir,
            `img${i + 1}`
          )
        : await fetchImageToFile(limited[i], dest)
      const ready = await prepareTelegramPhoto(downloaded, jobDir)
      paths.push(ready)
    } catch (error) {
      logger.warn('social image skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (paths.length === 0 && useIg && postUrl) {
    logger.info('instagram cdn batch failed, yt-dlp post fallback', { postUrl })
    const fromPost = await downloadInstagramPostImages(postUrl, jobDir)
    for (const rawPath of fromPost.slice(0, env.ALBUM_MAX_IMAGES)) {
      try {
        paths.push(await prepareTelegramPhoto(rawPath, jobDir))
      } catch (error) {
        logger.warn('social image skip (ytdlp)', {
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  if (paths.length === 0) {
    throw new Error('No images downloaded')
  }
  return paths
}
