import { access } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { fetchInstagramSlidesToDir } from '@/helpers/instagramCdnFetch'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramReelUrl, isInstagramUrl } from '@/helpers/instagramUrl'
import { scrapeAllInstagramImages } from '@/helpers/instagramScrape'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { fetchFacebookHtml } from '@/services/resolveFacebookUrl'
import {
  downloadYtdlpInstagramCarousel,
  probeYtdlpInstagramCarousel,
} from '@/services/instagramYtdlpCarousel'

const FB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function unescapeFbUrl(raw: string): string {
  return raw
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
}

/** Probe carousel / multi-photo URLs (embed scrape + yt-dlp metadata). */
export async function probeMetaCarouselUrls(url: string): Promise<string[]> {
  if (isInstagramUrl(url) && !isInstagramReelUrl(url)) {
    return scrapeAllInstagramImages(url)
  }
  if (isFacebookUrl(url)) {
    return scrapeFacebookAlbumImages(url)
  }
  return []
}

async function scrapeFacebookAlbumImages(url: string): Promise<string[]> {
  try {
    const html = await fetchFacebookHtml(url, 25_000, true)
    if (!html) {
      return []
    }
    const urls: string[] = []
    for (const match of html.matchAll(
      /"(?:uri|url|image)"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
    )) {
      const u = unescapeFbUrl(match[1])
      if (u.startsWith('http') && /fbcdn|facebook\.com/i.test(u)) {
        urls.push(u)
      }
    }
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const u of urls) {
      const key = u.split('?')[0]
      if (!seen.has(key)) {
        seen.add(key)
        ordered.push(u)
      }
    }
    if (ordered.length > 1) {
      logger.info('facebook carousel scrape', { url, count: ordered.length })
    }
    return ordered.slice(0, env.ALBUM_MAX_IMAGES)
  } catch {
    return []
  }
}

async function fetchFbSlidesToDir(
  urls: string[],
  pageUrl: string,
  jobDir: string
): Promise<string[]> {
  const { prepareTelegramPhoto } = await import('@/helpers/prepareTelegramPhoto')
  const paths: string[] = []
  const limit = Math.min(urls.length, env.ALBUM_MAX_IMAGES)
  for (let i = 0; i < limit; i++) {
    const dest = join(jobDir, `slide${String(i + 1).padStart(2, '0')}.jpg`)
    try {
      const downloaded = await fetchImageToFile(urls[i], dest, {
        referer: pageUrl,
        userAgent: FB_UA,
      })
      paths.push(await prepareTelegramPhoto(downloaded, jobDir))
    } catch (error) {
      logger.warn('meta carousel slide skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return paths
}

async function galleryDlBinary(): Promise<string | undefined> {
  const candidates = [
    env.GALLERY_DL_PATH_RESOLVED,
    join(process.cwd(), 'bin', 'gallery-dl'),
    'gallery-dl',
  ].filter(Boolean) as string[]
  for (const bin of candidates) {
    try {
      await access(bin)
      return bin
    } catch {
      // try next
    }
  }
  return undefined
}

async function tryGalleryDlDownload(
  url: string,
  jobDir: string
): Promise<string[]> {
  const bin = await galleryDlBinary()
  if (!bin) {
    return []
  }
  return new Promise((resolve) => {
    const child = spawn(
      bin,
      [
        '--no-mtime',
        '--no-part',
        '-d',
        jobDir,
        '-o',
        'filename={num:>02}.{extension}',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve([])
    }, env.DOWNLOAD_TIMEOUT_MS)
    child.on('close', async (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        logger.warn('gallery-dl failed', {
          url,
          code,
          detail: stderr.slice(0, 400),
        })
        resolve([])
        return
      }
      try {
        const { readdir } = await import('fs/promises')
        const { prepareTelegramPhoto } = await import('@/helpers/prepareTelegramPhoto')
        const names = (await readdir(jobDir))
          .filter((n) => /\.(jpe?g|webp|png)$/i.test(n))
          .sort()
        const paths: string[] = []
        for (const name of names.slice(0, env.ALBUM_MAX_IMAGES)) {
          paths.push(await prepareTelegramPhoto(join(jobDir, name), jobDir))
        }
        if (paths.length > 0) {
          logger.info('gallery-dl carousel ok', { url, count: paths.length })
        }
        resolve(paths)
      } catch {
        resolve([])
      }
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
  })
}

/**
 * Download Instagram/Facebook carousel: embed (multi-UA) → CDN → yt-dlp → gallery-dl.
 */
export async function downloadMetaCarousel(
  url: string,
  jobDir: string
): Promise<string[]> {
  const imageUrls = await probeMetaCarouselUrls(url)
  const useIg = isInstagramUrl(url)

  if (imageUrls.length > 0) {
    const paths = useIg
      ? await fetchInstagramSlidesToDir(imageUrls, url, jobDir)
      : await fetchFbSlidesToDir(imageUrls, url, jobDir)
    if (paths.length > 1) {
      logger.info('meta carousel download ok', {
        url,
        slides: paths.length,
        source: 'embed-cdn',
      })
      return paths
    }
    if (paths.length === 1 && imageUrls.length === 1) {
      logger.info('meta carousel download ok', {
        url,
        slides: 1,
        source: 'embed-cdn-single',
      })
      return paths
    }
  }

  if (useIg && !isInstagramReelUrl(url)) {
    const ytdlpPaths = await downloadYtdlpInstagramCarousel(url, jobDir)
    if (ytdlpPaths.length > 1) {
      const { prepareTelegramPhoto } = await import('@/helpers/prepareTelegramPhoto')
      const prepared = await Promise.all(
        ytdlpPaths.map((p) => prepareTelegramPhoto(p, jobDir))
      )
      logger.info('meta carousel download ok', {
        url,
        slides: prepared.length,
        source: 'yt-dlp',
      })
      return prepared
    }
    if (ytdlpPaths.length === 1 && !imageUrls.length) {
      const { prepareTelegramPhoto } = await import('@/helpers/prepareTelegramPhoto')
      return [await prepareTelegramPhoto(ytdlpPaths[0], jobDir)]
    }

    const ytdlpUrls = await probeYtdlpInstagramCarousel(url)
    if (ytdlpUrls.length > imageUrls.length) {
      const paths = await fetchInstagramSlidesToDir(ytdlpUrls, url, jobDir)
      if (paths.length > 1) {
        logger.info('meta carousel download ok', {
          url,
          slides: paths.length,
          source: 'ytdlp-cdn',
        })
        return paths
      }
    }
  }

  const fromGalleryDl = await tryGalleryDlDownload(url, jobDir)
  if (fromGalleryDl.length > 0) {
    return fromGalleryDl
  }

  if (imageUrls.length === 1) {
    const paths = useIg
      ? await fetchInstagramSlidesToDir(imageUrls, url, jobDir)
      : await fetchFbSlidesToDir(imageUrls, url, jobDir)
    if (paths.length > 0) {
      return paths
    }
  }

  throw new Error('Meta carousel: no images downloaded')
}
