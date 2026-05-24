import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { collectImageUrlsFromInfo } from '@/helpers/extractImageUrlsFromInfo'
import {
  normalizeMediaUrl,
  upscaleInstagramCdnUrl,
} from '@/helpers/normalizeMediaUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { buildDownloadFlags, SOCIAL_IMAGE_FORMAT } from '@/services/ytdlpOptions'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function readInfoJson(
  jobDir: string,
  fileBase: string
): Promise<YtDlpMetadata | undefined> {
  try {
    const raw = await readFile(join(jobDir, `${fileBase}.info.json`), 'utf8')
    return JSON.parse(raw) as YtDlpMetadata
  } catch {
    return undefined
  }
}

async function listImageFiles(jobDir: string): Promise<string[]> {
  const entries = await readdir(jobDir)
  return entries
    .filter(
      (n) =>
        /\.(jpe?g|webp|png)$/i.test(n) &&
        !n.endsWith('.info.json') &&
        !n.startsWith('tg-')
    )
    .sort()
    .map((n) => join(jobDir, n))
}

async function fetchCdnImage(
  imageUrl: string,
  postUrl: string,
  dest: string
): Promise<string> {
  const candidates = [
    normalizeMediaUrl(imageUrl),
    upscaleInstagramCdnUrl(imageUrl),
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

async function downloadViaYtdlpPost(
  postUrl: string,
  jobDir: string,
  label: string
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
    label
  )

  const onDisk = await listImageFiles(jobDir)
  if (onDisk.length > 0) {
    return onDisk
  }

  const info = await readInfoJson(jobDir, 'video')
  if (!info) {
    return []
  }

  const urls = await collectImageUrlsFromInfo(info, postUrl)
  const paths: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const dest = join(jobDir, `meta${i + 1}.jpg`)
    try {
      paths.push(await fetchCdnImage(urls[i], postUrl, dest))
    } catch (error) {
      logger.warn('instagram metadata image skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return paths
}

/** Download IG photo(s) via yt-dlp on the post URL (not hotlinked CDN). */
export async function downloadInstagramPostImages(
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const paths = await downloadViaYtdlpPost(postUrl, jobDir, 'ig-post')
  if (paths.length > 0) {
    logger.info('instagram post download ok', {
      postUrl,
      count: paths.length,
    })
    return paths
  }
  throw new Error('Instagram post produced no images')
}

/** Try post yt-dlp first; optional CDN URL only for direct fetch (never yt-dlp generic on CDN). */
export async function downloadInstagramCdnImage(
  imageUrl: string,
  postUrl: string,
  dest: string,
  jobDir: string,
  _fileBase: string
): Promise<string> {
  try {
    const fromPost = await downloadViaYtdlpPost(postUrl, jobDir, 'ig-post-single')
    if (fromPost.length > 0) {
      return fromPost[0]
    }
  } catch (error) {
    logger.warn('instagram post ytdlp failed, trying cdn fetch', {
      postUrl,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    return await fetchCdnImage(imageUrl, postUrl, dest)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.info('instagram cdn fetch failed', { postUrl, status: detail })
    throw error
  }
}

export function shouldUseInstagramDownloaders(url: string): boolean {
  return isInstagramUrl(url)
}
