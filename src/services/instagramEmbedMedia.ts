import { join } from 'path'
import { fetchBestInstagramEmbedHtml } from '@/helpers/instagramEmbedFetch'
import { fetchInstagramCdnToFile } from '@/helpers/instagramCdnFetch'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import {
  dedupeByAssetId,
  extractDisplayUrls,
} from '@/helpers/instagramHtmlExtract'
import {
  extractInstagramVideoCandidates,
  pickBestInstagramVideo,
} from '@/helpers/instagramVideoExtract'
import { isInstagramReelUrl } from '@/helpers/instagramUrl'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { stat } from 'fs/promises'
import { fetchInstagramVideoToFile } from '@/helpers/instagramCdnVideoFetch'
import { resolveInstagramVideoViaApi } from '@/services/instagramPublicMedia'

export interface InstagramEmbedOffer {
  title: string
  videoHeights: number[]
  imageSizes: number[]
  audioExts: string[]
  hasImage: boolean
  hasAudio: boolean
  downloadUrl: string
  albumUrls: string[]
  hasAlbum: boolean
  isFile: boolean
}

export function isInstagramYtdlpBlocked(detail: string): boolean {
  const lower = detail.toLowerCase()
  return (
    lower.includes('rate-limit') ||
    lower.includes('rate limit') ||
    lower.includes('login required') ||
    lower.includes('not available') ||
    lower.includes('requested content is not available')
  )
}

export interface InstagramEmbedProbe {
  imageUrls: string[]
  videoUrl?: string
}

export async function probeInstagramEmbed(url: string): Promise<InstagramEmbedProbe> {
  const { html: embedHtml } = await fetchBestInstagramEmbedHtml(url)
  const { fetchInstagramPageHtml, resolveInstagramVideoViaApi } = await import(
    '@/services/instagramPublicMedia'
  )

  let mergedHtml = embedHtml || ''
  if (isInstagramReelUrl(url)) {
    const pageHtml = await fetchInstagramPageHtml(url)
    if (pageHtml) {
      mergedHtml = `${mergedHtml}\n${pageHtml}`
    }
  }

  let videoUrl = pickBestInstagramVideo(
    extractInstagramVideoCandidates(mergedHtml)
  )?.url

  if (!videoUrl && isInstagramReelUrl(url)) {
    videoUrl = await resolveInstagramVideoViaApi(url)
  }

  const imageUrls = mergedHtml
    ? dedupeByAssetId(extractDisplayUrls(mergedHtml)).slice(0, env.ALBUM_MAX_IMAGES)
    : []

  if (!mergedHtml && !videoUrl) {
    return { imageUrls: [] }
  }

  return { imageUrls, videoUrl }
}

/** Build format menu offer from embed HTML (no yt-dlp). */
export async function probeInstagramEmbedOffer(
  url: string
): Promise<InstagramEmbedOffer | null> {
  const embed = await probeInstagramEmbed(url)
  const heights: number[] = embed.videoUrl ? [720, 1080] : []
  const imageSizes = embed.imageUrls.length > 0 ? [1080] : []

  if (heights.length === 0 && imageSizes.length === 0) {
    return null
  }

  return {
    title: 'Instagram',
    videoHeights: heights,
    imageSizes,
    audioExts: heights.length > 0 ? ['m4a'] : [],
    hasImage: imageSizes.length > 0,
    hasAudio: heights.length > 0,
    downloadUrl: url,
    albumUrls: embed.imageUrls,
    hasAlbum: embed.imageUrls.length > 1,
    isFile: false,
  }
}

/** Download reel/video MP4 from embed CDN when yt-dlp is rate-limited. */
export async function downloadInstagramEmbedVideo(
  postUrl: string,
  dest: string
): Promise<string> {
  const embed = await probeInstagramEmbed(postUrl)
  let videoUrl = embed.videoUrl

  if (!videoUrl) {
    videoUrl = await resolveInstagramVideoViaApi(postUrl)
  }
  if (!videoUrl) {
    throw new Error('No video URL in Instagram embed')
  }
  const isHls = /\.m3u8/i.test(videoUrl)
  if (isHls) {
    throw new Error('Instagram embed returned HLS only; yt-dlp required')
  }
  await fetchInstagramVideoToFile(videoUrl, postUrl, dest)
  const size = (await stat(dest)).size
  logger.info('instagram embed video download ok', { url: postUrl, bytes: size })
  return dest
}

/** Fetch one slide for carousel (embed CDN). */
export async function downloadInstagramEmbedImages(
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const embed = await probeInstagramEmbed(postUrl)
  if (embed.imageUrls.length === 0) {
    throw new Error('No images in Instagram embed')
  }
  const paths: string[] = []
  for (let i = 0; i < embed.imageUrls.length; i++) {
    const dest = join(jobDir, `slide${String(i + 1).padStart(2, '0')}.jpg`)
    const raw = await fetchInstagramCdnToFile(embed.imageUrls[i], postUrl, dest)
    paths.push(await prepareTelegramPhoto(raw, jobDir))
  }
  logger.info('instagram embed carousel ok', {
    url: postUrl,
    count: paths.length,
  })
  return paths
}

export function instagramLikelyNeedsEmbed(url: string): boolean {
  return isInstagramReelUrl(url) || /instagram\.com\/p\//i.test(url)
}
