import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import {
  normalizeMediaUrl,
  upscaleInstagramCdnUrl,
} from '@/helpers/normalizeMediaUrl'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import {
  downloadMetaCarousel,
  probeMetaCarouselUrls,
} from '@/services/metaCarouselDownload'
import logger from '@/lib/logger'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchCdnImage(
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
  for (const url of candidates) {
    for (const headers of headerSets) {
      try {
        return await fetchImageToFile(url, dest, headers)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

/** Download IG photo(s) via embed scrape + CDN (not yt-dlp). */
export async function downloadInstagramPostImages(
  postUrl: string,
  jobDir: string,
  expectCarousel = false
): Promise<string[]> {
  const urls = await probeMetaCarouselUrls(postUrl)
  if (urls.length > 1 || (expectCarousel && urls.length > 0)) {
    try {
      const paths = await downloadMetaCarousel(postUrl, jobDir)
      logger.info('instagram post download ok', {
        postUrl,
        count: paths.length,
        carousel: paths.length > 1,
      })
      return paths
    } catch (error) {
      if (!expectCarousel && urls.length <= 1) {
        throw error
      }
      logger.warn('meta carousel download failed', {
        postUrl,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (urls.length === 1) {
    const dest = join(jobDir, 'slide01.jpg')
    const raw = await fetchCdnImage(urls[0], postUrl, dest)
    const ready = await prepareTelegramPhoto(raw, jobDir)
    logger.info('instagram post download ok', {
      postUrl,
      count: 1,
      carousel: false,
    })
    return [ready]
  }

  throw new Error('Instagram post produced no images')
}

export async function downloadInstagramCdnImage(
  imageUrl: string,
  postUrl: string,
  dest: string,
  jobDir: string,
  _fileBase: string
): Promise<string> {
  try {
    const paths = await downloadInstagramPostImages(postUrl, jobDir, false)
    if (paths.length > 0) {
      return paths[0]
    }
  } catch {
    // single CDN fallback
  }
  const raw = await fetchCdnImage(imageUrl, postUrl, dest)
  return prepareTelegramPhoto(raw, jobDir)
}

export function shouldUseInstagramDownloaders(url: string): boolean {
  return isInstagramUrl(url)
}
