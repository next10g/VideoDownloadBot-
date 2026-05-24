import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { collectImageUrlsFromInfo } from '@/helpers/extractImageUrlsFromInfo'
import { scrapeAllInstagramImages } from '@/helpers/instagramScrape'
import {
  normalizeMediaUrl,
  upscaleInstagramCdnUrl,
} from '@/helpers/normalizeMediaUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { buildDownloadFlags, SOCIAL_IMAGE_FORMAT } from '@/services/ytdlpOptions'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

const IG_ANDROID_UA =
  'Instagram 359.0.0.0.36 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 671551709)'

const IG_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function readPostInfoJson(jobDir: string): Promise<YtDlpMetadata | undefined> {
  const names = (await readdir(jobDir))
    .filter((n) => n.endsWith('.info.json'))
    .sort()
  let best: YtDlpMetadata | undefined
  for (const name of names) {
    try {
      const parsed = JSON.parse(
        await readFile(join(jobDir, name), 'utf8')
      ) as YtDlpMetadata
      if (parsed.entries && parsed.entries.length > 1) {
        return parsed
      }
      if (!best) {
        best = parsed
      }
    } catch {
      // skip invalid json
    }
  }
  return best
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
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((n) => join(jobDir, n))
}

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

async function fetchUrlsToDir(
  urls: string[],
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const paths: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const dest = join(jobDir, `slide${i + 1}.jpg`)
    try {
      paths.push(await fetchCdnImage(urls[i], postUrl, dest))
    } catch (error) {
      logger.warn('instagram slide fetch skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return paths
}

async function downloadViaYtdlpPost(
  postUrl: string,
  jobDir: string,
  label: string
): Promise<string[]> {
  const outputBase = join(jobDir, 'slide')
  await runYtdlpDownload(
    postUrl,
    {
      ...buildDownloadFlags(outputBase, false, {
        imageMode: true,
        sourceUrl: postUrl,
      }),
      format: SOCIAL_IMAGE_FORMAT,
      writeInfoJson: true,
      output: `${outputBase}.%(playlist_index)02d.%(ext)s`,
    },
    env.DOWNLOAD_TIMEOUT_MS,
    label
  )

  const info = await readPostInfoJson(jobDir)
  const metaUrls = info
    ? await collectImageUrlsFromInfo(info, postUrl)
    : []
  if (metaUrls.length > 0) {
    const fetched = await fetchUrlsToDir(
      metaUrls.slice(0, env.ALBUM_MAX_IMAGES),
      postUrl,
      jobDir
    )
    if (fetched.length > 0) {
      return fetched
    }
  }

  const onDisk = await listImageFiles(jobDir)
  if (onDisk.length > 0) {
    return onDisk
  }

  return []
}

/** Download IG photo(s) via yt-dlp + full-res CDN fetch. */
export async function downloadInstagramPostImages(
  postUrl: string,
  jobDir: string,
  expectCarousel = false
): Promise<string[]> {
  let paths = await downloadViaYtdlpPost(postUrl, jobDir, 'ig-post')

  if (paths.length <= 1 && (expectCarousel || paths.length === 0)) {
    const scraped = await scrapeAllInstagramImages(postUrl)
    if (scraped.length > paths.length) {
      const fetched = await fetchUrlsToDir(
        scraped.slice(0, env.ALBUM_MAX_IMAGES),
        postUrl,
        jobDir
      )
      if (fetched.length > paths.length) {
        paths = fetched
      }
    }
  }

  if (paths.length > 0) {
    logger.info('instagram post download ok', {
      postUrl,
      count: paths.length,
      carousel: paths.length > 1,
    })
    return paths
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
  const paths = await downloadInstagramPostImages(postUrl, jobDir, false)
  if (paths.length > 0) {
    return paths[0]
  }
  return fetchCdnImage(imageUrl, postUrl, dest)
}

export function shouldUseInstagramDownloaders(url: string): boolean {
  return isInstagramUrl(url)
}
