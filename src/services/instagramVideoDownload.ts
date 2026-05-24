import { join } from 'path'
import { readFile, readdir } from 'fs/promises'
import { buildDownloadFlags } from '@/services/ytdlpOptions'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import {
  downloadInstagramEmbedVideo,
  isInstagramYtdlpBlocked,
  probeInstagramEmbed,
} from '@/services/instagramEmbedMedia'
import { fetchInstagramVideoToFile } from '@/helpers/instagramCdnVideoFetch'
import { resolveInstagramVideoViaApi } from '@/services/instagramPublicMedia'
import env from '@/helpers/env'
import logger from '@/lib/logger'

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

function isVideoFile(path: string): boolean {
  return /\.(mp4|m4v|mov|webm|mkv)$/i.test(path)
}

async function tryEmbedVideoFirst(
  url: string,
  jobDir: string
): Promise<{ filePath: string; info?: YtDlpMetadata } | undefined> {
  if (!env.IG_EMBED_FALLBACK) {
    return undefined
  }
  try {
    const embed = await probeInstagramEmbed(url)
    let videoUrl = embed.videoUrl
    if (!videoUrl) {
      videoUrl = await resolveInstagramVideoViaApi(url)
    }
    if (!videoUrl || /\.m3u8/i.test(videoUrl)) {
      return undefined
    }
    const dest = join(jobDir, 'video.mp4')
    await fetchInstagramVideoToFile(videoUrl, url, dest)
    const { stat: fsStat } = await import('fs/promises')
    const size = (await fsStat(dest)).size
    if (size < 80_000 && /\/(reel|tv)\//i.test(url)) {
      return undefined
    }
    logger.info('instagram video download ok', {
      url,
      bytes: size,
      attempt: 'embed-cdn-first',
    })
    return { filePath: dest, info: { title: 'Instagram', ext: 'mp4' } }
  } catch {
    return undefined
  }
}

/** Download IG reel / video post: embed CDN → yt-dlp (no cookies). */
export async function runInstagramVideoDownload(
  url: string,
  jobDir: string,
  outputBase: string,
  audio: boolean,
  maxHeight: number
): Promise<{ filePath: string; info?: YtDlpMetadata; stderr: string }> {
  const embedFirst = await tryEmbedVideoFirst(url, jobDir)
  if (embedFirst) {
    return { ...embedFirst, stderr: '' }
  }

  const attempts: Array<{ relaxed: boolean; label: string }> = [
    { relaxed: false, label: 'ig-video' },
    { relaxed: true, label: 'ig-video-relaxed' },
  ]

  let lastError: Error | undefined
  let lastStderr = ''

  for (const attempt of attempts) {
    try {
      const result = await runYtdlpDownload(
        url,
        {
          ...buildDownloadFlags(outputBase, audio, {
            sourceUrl: url,
            maxHeight,
            imageMode: false,
            relaxedFormat: attempt.relaxed,
          }),
          noPlaylist: true,
          writeInfoJson: true,
        },
        env.DOWNLOAD_TIMEOUT_MS,
        attempt.label
      )

      const info = await readInfoJson(jobDir, 'video')
      let filePath: string
      try {
        const hinted =
          info?._filename ||
          (info?.ext ? join(jobDir, `video.${info.ext}`) : undefined)
        filePath = await resolveDownloadedMediaPath(
          jobDir,
          'video',
          false,
          hinted
        )
      } catch {
        const entries = await readdir(jobDir)
        const media = entries.find((n) => isVideoFile(n) && !n.endsWith('.info.json'))
        if (!media) {
          throw new Error('Instagram video file not found after yt-dlp')
        }
        filePath = join(jobDir, media)
      }

      if (!isVideoFile(filePath)) {
        throw new Error('Instagram download produced image instead of video')
      }

      const { stat } = await import('fs/promises')
      const size = (await stat(filePath)).size
      if (size < 80_000 && /\/(reel|tv)\//i.test(url)) {
        throw new Error('Instagram reel download produced thumbnail only')
      }

      logger.info('instagram video download ok', {
        url,
        bytes: size,
        attempt: attempt.label,
      })

      return { filePath, info, stderr: result.stderr }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      lastStderr = lastError.message
      logger.warn('instagram video attempt failed', {
        url,
        label: attempt.label,
        detail: lastError.message.slice(0, 300),
      })
    }
  }

  if (isInstagramYtdlpBlocked(lastStderr)) {
    try {
      const dest = join(jobDir, 'video.mp4')
      await downloadInstagramEmbedVideo(url, dest)
      const { stat: fsStat } = await import('fs/promises')
      const size = (await fsStat(dest)).size
      if (size < 80_000 && /\/(reel|tv)\//i.test(url)) {
        throw new Error('Instagram embed video too small')
      }
      logger.info('instagram video download ok', {
        url,
        bytes: size,
        attempt: 'embed-cdn',
      })
      return { filePath: dest, info: { title: 'Instagram', ext: 'mp4' }, stderr: '' }
    } catch (embedError) {
      logger.warn('instagram embed video fallback failed', {
        url,
        detail:
          embedError instanceof Error ? embedError.message : String(embedError),
      })
    }
  }

  throw lastError ?? new Error(lastStderr || 'Instagram video download failed')
}
