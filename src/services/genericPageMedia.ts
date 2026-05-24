import { join } from 'path'
import env from '@/helpers/env'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import { isGenericFileUrl } from '@/helpers/isGenericFileUrl'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { detectPlatform } from '@/helpers/detectPlatform'
import logger from '@/lib/logger'
import type { MediaFormatOffer } from '@/services/mediaProbe'
import { fetchInstagramVideoToFile } from '@/helpers/instagramCdnVideoFetch'
import { downloadStreamToFile } from '@/services/youtubeStreamDownload'

const PAGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|m3u8)(\?|$)/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i
const FILE_EXT =
  /\.(pdf|zip|rar|7z|apk|mp3|m4a|wav|docx?|xlsx?|pptx?|csv|txt|epub)(\?|$)/i

export interface GenericPageMedia {
  title: string
  videoUrls: string[]
  imageUrls: string[]
  fileUrls: string[]
}

function decodeHtmlAttr(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function absolutize(base: string, href: string): string | undefined {
  try {
    return new URL(href, base).href
  } catch {
    return undefined
  }
}

function uniqueHttp(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    if (!u.startsWith('http') || seen.has(u)) {
      continue
    }
    seen.add(u)
    out.push(u)
  }
  return out
}

function extractMeta(html: string, property: string): string[] {
  const urls: string[] = []
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'gi'
  )
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = decodeHtmlAttr(match[1] || match[2] || '')
    if (raw.startsWith('http')) {
      urls.push(raw)
    }
  }
  return urls
}

function extractTagUrls(html: string, tag: string, attr: string): string[] {
  const urls: string[] = []
  const re = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = decodeHtmlAttr(match[1])
    if (raw.startsWith('http') || raw.startsWith('//')) {
      urls.push(raw.startsWith('//') ? `https:${raw}` : raw)
    }
  }
  return urls
}

function extractJsonLdMedia(html: string): { videos: string[]; images: string[] } {
  const videos: string[] = []
  const images: string[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    try {
      const data = JSON.parse(match[1]) as unknown
      const stack: unknown[] = [data]
      while (stack.length > 0) {
        const node = stack.pop()
        if (!node || typeof node !== 'object') {
          continue
        }
        const rec = node as Record<string, unknown>
        if (typeof rec.contentUrl === 'string' && rec.contentUrl.startsWith('http')) {
          if (String(rec['@type'] || '').toLowerCase().includes('video')) {
            videos.push(rec.contentUrl)
          } else {
            images.push(rec.contentUrl)
          }
        }
        if (typeof rec.thumbnailUrl === 'string' && rec.thumbnailUrl.startsWith('http')) {
          images.push(rec.thumbnailUrl)
        }
        if (typeof rec.embedUrl === 'string' && rec.embedUrl.startsWith('http')) {
          videos.push(rec.embedUrl)
        }
        for (const val of Object.values(rec)) {
          if (val && typeof val === 'object') {
            stack.push(val)
          }
        }
      }
    } catch {
      // skip invalid JSON-LD
    }
  }
  return { videos, images }
}

export function extractMediaFromHtml(html: string, pageUrl: string): GenericPageMedia {
  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = decodeHtmlAttr(titleMatch?.[1] || 'Media').slice(0, 120)

  const ogVideo = [
    ...extractMeta(html, 'og:video'),
    ...extractMeta(html, 'og:video:url'),
    ...extractMeta(html, 'og:video:secure_url'),
    ...extractMeta(html, 'twitter:player:stream'),
  ]
  const ogImage = [
    ...extractMeta(html, 'og:image'),
    ...extractMeta(html, 'og:image:url'),
    ...extractMeta(html, 'twitter:image'),
  ]

  const tagVideo = extractTagUrls(html, 'video', 'src')
  const tagSource = extractTagUrls(html, 'source', 'src')
  const ld = extractJsonLdMedia(html)

  const inlineVideos = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>]*)?/gi)].map(
    (m) => m[0]
  )
  const inlineImages = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/gi)].map(
    (m) => m[0]
  )

  const videoUrls = uniqueHttp(
    [...ogVideo, ...ld.videos, ...tagVideo, ...tagSource, ...inlineVideos]
      .map((u) => absolutize(pageUrl, u))
      .filter((u): u is string => Boolean(u))
      .filter((u) => VIDEO_EXT.test(u) || /\/video\//i.test(u))
  )

  const imageUrls = uniqueHttp(
    [...ogImage, ...ld.images, ...inlineImages]
      .map((u) => absolutize(pageUrl, u))
      .filter((u): u is string => Boolean(u))
      .filter((u) => IMAGE_EXT.test(u))
      .filter((u) => !/favicon|logo|sprite|icon/i.test(u))
  )

  const fileUrls = uniqueHttp(
    [...html.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
      .map((m) => m[0])
      .filter((u) => FILE_EXT.test(u))
  )

  return { title, videoUrls, imageUrls, fileUrls }
}

export async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(25_000),
    headers: {
      'User-Agent': PAGE_UA,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    },
    redirect: 'follow',
  })
  if (!res.ok) {
    throw new Error(`Page fetch HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
    throw new Error(`Not an HTML page (${ct.slice(0, 40)})`)
  }
  return res.text()
}

export function shouldTryGenericPageProbe(url: string): boolean {
  if (isYoutubeUrl(url) || isInstagramUrl(url) || isFacebookUrl(url)) {
    return false
  }
  if (detectPlatform(url) === 'tiktok') {
    return false
  }
  return true
}

export async function probeGenericPage(url: string): Promise<MediaFormatOffer | null> {
  if (!shouldTryGenericPageProbe(url)) {
    return null
  }
  try {
    const html = await fetchPageHtml(url)
    const media = extractMediaFromHtml(html, url)
    const hasVideo = media.videoUrls.length > 0
    const hasImage = media.imageUrls.length > 0
    const isFile = isGenericFileUrl(url) || media.fileUrls.length > 0

    if (!hasVideo && !hasImage && !isFile) {
      return null
    }

    logger.info('generic page probe ok', {
      url,
      videos: media.videoUrls.length,
      images: media.imageUrls.length,
      files: media.fileUrls.length,
    })

    return {
      title: media.title,
      videoHeights: hasVideo ? [720, 1080] : [],
      imageSizes: hasImage ? [1080] : [],
      audioExts: hasVideo ? ['m4a'] : [],
      hasImage,
      hasAudio: hasVideo,
      downloadUrl: url,
      albumUrls: media.imageUrls.slice(0, env.ALBUM_MAX_IMAGES),
      hasAlbum: media.imageUrls.length > 1,
      isFile,
    }
  } catch (error) {
    logger.warn('generic page probe failed', {
      url,
      detail: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function downloadGenericPageVideo(
  pageUrl: string,
  jobDir: string
): Promise<string> {
  const html = await fetchPageHtml(pageUrl)
  const media = extractMediaFromHtml(html, pageUrl)
  const videoUrl = media.videoUrls[0]
  if (!videoUrl) {
    throw new Error('No video found on page')
  }
  const dest = join(jobDir, 'video.mp4')
  if (/cdninstagram|fbcdn/i.test(videoUrl)) {
    await fetchInstagramVideoToFile(videoUrl, pageUrl, dest)
  } else if (/\.m3u8/i.test(videoUrl)) {
    throw new Error('HLS stream on page — yt-dlp required')
  } else {
    await downloadStreamToFile(videoUrl, dest, env.DOWNLOAD_TIMEOUT_MS, pageUrl)
  }
  return dest
}

export async function downloadGenericPageImages(
  pageUrl: string,
  jobDir: string,
  urls?: string[]
): Promise<string[]> {
  const imageUrls =
    urls && urls.length > 0
      ? urls
      : extractMediaFromHtml(await fetchPageHtml(pageUrl), pageUrl).imageUrls
  const paths: string[] = []
  const limit = Math.min(imageUrls.length, env.ALBUM_MAX_IMAGES)
  for (let i = 0; i < limit; i++) {
    const dest = join(jobDir, `slide${String(i + 1).padStart(2, '0')}.jpg`)
    const downloaded = await fetchImageToFile(imageUrls[i], dest, {
      referer: pageUrl,
    })
    paths.push(await prepareTelegramPhoto(downloaded, jobDir))
  }
  if (paths.length === 0) {
    throw new Error('No images downloaded from page')
  }
  return paths
}

export async function downloadGenericPageFile(
  pageUrl: string,
  jobDir: string
): Promise<string> {
  if (isGenericFileUrl(pageUrl)) {
    const dest = join(jobDir, 'file.bin')
    await downloadStreamToFile(pageUrl, dest, env.DOWNLOAD_TIMEOUT_MS, pageUrl)
    return dest
  }
  const html = await fetchPageHtml(pageUrl)
  const media = extractMediaFromHtml(html, pageUrl)
  const fileUrl = media.fileUrls[0]
  if (!fileUrl) {
    throw new Error('No file link found on page')
  }
  const ext = fileUrl.match(FILE_EXT)?.[1] || 'bin'
  const dest = join(jobDir, `file.${ext}`)
  await downloadStreamToFile(fileUrl, dest, env.DOWNLOAD_TIMEOUT_MS, pageUrl)
  return dest
}
