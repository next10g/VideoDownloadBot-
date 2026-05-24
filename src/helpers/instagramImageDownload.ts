import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { buildDownloadFlags, SOCIAL_IMAGE_FORMAT } from '@/services/ytdlpOptions'
import { runYtdlpDownload } from '@/services/ytdlpRunner'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchWithHeaders(
  imageUrl: string,
  dest: string,
  referer: string,
  userAgent: string
): Promise<string> {
  return fetchImageToFile(imageUrl, dest, { referer, userAgent })
}

/** CDN fetch with browser-like headers; falls back to yt-dlp for the same URL. */
export async function downloadInstagramCdnImage(
  imageUrl: string,
  postUrl: string,
  dest: string,
  jobDir: string,
  fileBase: string
): Promise<string> {
  const attempts = [
    { referer: postUrl, userAgent: IG_ANDROID_UA },
    { referer: 'https://www.instagram.com/', userAgent: IG_DESKTOP_UA },
    { referer: postUrl, userAgent: IG_DESKTOP_UA },
  ]

  let lastError: Error | undefined
  for (const headers of attempts) {
    try {
      return await fetchWithHeaders(imageUrl, dest, headers.referer, headers.userAgent)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  logger.info('instagram cdn fetch blocked, trying yt-dlp on image url', {
    postUrl,
    status: lastError?.message,
  })

  const outputBase = join(jobDir, fileBase)
  await runYtdlpDownload(
    imageUrl,
    {
      ...buildDownloadFlags(outputBase, false, {
        imageMode: true,
        sourceUrl: postUrl,
      }),
      format: SOCIAL_IMAGE_FORMAT,
      writeInfoJson: false,
    },
    env.DOWNLOAD_TIMEOUT_MS,
    'ig-cdn'
  )
  return resolveDownloadedMediaPath(jobDir, fileBase, true)
}

/** Download all slides from post URL via yt-dlp playlist (carousel fallback). */
export async function downloadInstagramPostImages(
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const outputBase = join(jobDir, 'video')
  await runYtdlpDownload(
    postUrl,
    {
      ...buildDownloadFlags(outputBase, false, {
        imageMode: true,
        sourceUrl: postUrl,
      }),
      format: SOCIAL_IMAGE_FORMAT,
      writeInfoJson: true,
    },
    env.DOWNLOAD_TIMEOUT_MS,
    'ig-post-images'
  )

  const paths: string[] = []
  const single = await resolveDownloadedMediaPath(jobDir, 'video', true).catch(
    () => undefined
  )
  if (single) {
    paths.push(single)
    return paths
  }

  const entries = await import('fs/promises').then((fs) => fs.readdir(jobDir))
  const images = entries.filter(
    (n) =>
      /^video(\.\d+)?\.(jpe?g|webp|png)$/i.test(n) ||
      /^img\d+\./i.test(n) ||
      (n.startsWith('video') && /\.(jpe?g|webp|png)$/i.test(n))
  )
  for (const name of images.sort()) {
    paths.push(join(jobDir, name))
  }
  return paths
}

export function shouldUseInstagramDownloaders(url: string): boolean {
  return isInstagramUrl(url)
}
