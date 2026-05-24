import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import {
  normalizeMediaUrl,
  upscaleInstagramCdnUrl,
} from '@/helpers/normalizeMediaUrl'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import env from '@/helpers/env'
import logger from '@/lib/logger'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchInstagramCdnToFile(
  imageUrl: string,
  postUrl: string,
  dest: string
): Promise<string> {
  const candidates = [
    upscaleInstagramCdnUrl(imageUrl),
    normalizeMediaUrl(imageUrl),
  ]
  const headerSets = [
    { referer: postUrl, userAgent: IG_ANDROID_UA },
    { referer: 'https://www.instagram.com/', userAgent: IG_DESKTOP_UA },
  ]
  let lastError: Error | undefined
  for (const candidate of candidates) {
    for (const headers of headerSets) {
      try {
        return await fetchImageToFile(candidate, dest, headers)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }
  throw lastError ?? new Error('CDN fetch failed')
}

export async function fetchInstagramSlidesToDir(
  urls: string[],
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const paths: string[] = []
  const limit = Math.min(urls.length, env.ALBUM_MAX_IMAGES)
  for (let i = 0; i < limit; i++) {
    const dest = join(jobDir, `slide${String(i + 1).padStart(2, '0')}.jpg`)
    try {
      const downloaded = await fetchInstagramCdnToFile(urls[i], postUrl, dest)
      paths.push(await prepareTelegramPhoto(downloaded, jobDir))
    } catch (error) {
      logger.warn('instagram slide fetch skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return paths
}
