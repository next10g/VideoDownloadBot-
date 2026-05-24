import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { DocumentType } from '@typegoose/typegoose'
import { InputFile } from 'grammy'
import { findOrCreateChat } from '@/models/Chat'
import { DownloadMode } from '@/models/DownloadMode'
import { findOrCreateUrl } from '@/models/Url'
import { markLinkLogResult } from '@/helpers/logUserLink'
import type { SendMediaOptions } from '@/helpers/sendMediaOptions'
import DownloadJob from '@/models/DownloadJob'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import env from '@/helpers/env'
import getThumbnailUrl from '@/helpers/getThumbnailUrl'
import { shouldProcessThumbnail } from '@/helpers/lowMemory'
import { recordDownloadFailure } from '@/helpers/userAbuse'
import report from '@/helpers/report'
import { metrics } from '@/lib/metrics'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import withTimeout from '@/helpers/withTimeout'
import logger from '@/lib/logger'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { downloadFacebookDirect } from '@/services/facebookEmbed'
import { buildDownloadFlags } from '@/services/ytdlpOptions'
import { runYoutubeDownload } from '@/services/youtubeDownload'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import {
  isCookieConfigurationError,
  isYoutubeBotBlock,
  isYoutubeCookiesInvalid,
} from '@/services/ytdlpCookies'
import { validateMetadata } from '@/services/ytdlpProbe'

function escapeTitle(title: string | undefined): string {
  return (title || '').replace('<', '&lt;').replace('>', '&gt;')
}

function isDocumentNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'DocumentNotFoundError' ||
      error.message.includes('No document found'))
  )
}

async function saveDownloadJob(
  downloadJob: DocumentType<DownloadJob>,
  context: string
): Promise<void> {
  try {
    await downloadJob.save()
  } catch (error) {
    if (isDocumentNotFound(error)) {
      logger.warn('download job removed while processing', {
        jobId: downloadJob.id,
        context,
      })
      return
    }
    throw error
  }
}

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

const MEDIA_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mkv',
  '.m4a',
  '.mp3',
  '.opus',
  '.aac',
  '.flac',
]

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.webp', '.png', '.gif']

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isMediaFile(name: string, allowImages: boolean): boolean {
  if (name.endsWith('.part') || name.endsWith('.info.json')) {
    return false
  }
  if (isImageFile(name)) {
    return allowImages
  }
  return MEDIA_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
}

async function findMediaFile(
  jobDir: string,
  fileBase: string,
  allowImages: boolean
): Promise<string | undefined> {
  const entries = await readdir(jobDir)
  const prefixed = entries.filter(
    (name) =>
      name.startsWith(`${fileBase}.`) && isMediaFile(name, allowImages)
  )
  if (prefixed.length === 1) {
    return join(jobDir, prefixed[0])
  }
  const any = entries.filter((n) => isMediaFile(n, allowImages))
  if (any.length === 1) {
    return join(jobDir, any[0])
  }
  if (allowImages) {
    const thumb = entries.find(
      (n) => n.includes('thumbnail') && isImageFile(n)
    )
    if (thumb) {
      return join(jobDir, thumb)
    }
  }
  return undefined
}

async function resolveDownloadedPath(
  info: YtDlpMetadata,
  jobDir: string,
  fileBase: string
): Promise<string> {
  if (info._filename) {
    return info._filename
  }
  const ext = info.ext || info.entries?.[0]?.ext
  if (ext) {
    return join(jobDir, `${fileBase}.${ext}`)
  }
  const found = await findMediaFile(jobDir, fileBase, false)
  if (found) {
    return found
  }
  throw new Error('Could not resolve downloaded file path')
}

async function assertFileWithinLimits(filePath: string): Promise<number> {
  const fileStat = await stat(filePath)
  if (fileStat.size > env.MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Downloaded file exceeds ${env.MAX_FILE_SIZE_MB}MB after download`
    )
  }
  return fileStat.size
}

export default async function downloadUrl(
  downloadJob: DocumentType<DownloadJob>
): Promise<void> {
  const fileBase = `dl-${String(downloadJob.id)}`
  let jobDir = ''
  try {
    jobDir = await createJobTempDir(fileBase)
    const outputBase = join(jobDir, 'video')
    const jobId = String(downloadJob.id)

    const imageMode = downloadJob.downloadMode === DownloadMode.image
    const maxHeight =
      downloadJob.maxHeight > 0 ? downloadJob.maxHeight : env.YOUTUBE_MAX_HEIGHT
    const flagOpts = {
      maxHeight,
      imageMode,
      sourceUrl: downloadJob.url,
    }

    logger.info('download start', {
      url: downloadJob.url,
      jobId,
      jobDir,
      mode: downloadJob.downloadMode,
      maxHeight,
      direct: Boolean(downloadJob.directStreamUrl),
    })

    let filePath: string
    let info: YtDlpMetadata | undefined
    let ytdlpResult = { stderr: '' }

    if (downloadJob.directStreamUrl) {
      const ext = imageMode ? '.jpg' : '.mp4'
      filePath = join(jobDir, `video${ext}`)
      logger.info('facebook direct download', { jobId, ext })
      await downloadFacebookDirect(
        downloadJob.directStreamUrl,
        filePath,
        env.DOWNLOAD_TIMEOUT_MS
      )
      info = {
        title: 'Facebook',
        ext: ext.replace('.', ''),
      }
    } else {
      ytdlpResult =
        isYoutubeUrl(downloadJob.url) && !imageMode
          ? await runYoutubeDownload(
              downloadJob.url,
              outputBase,
              downloadJob.audio,
              jobId,
              env.DOWNLOAD_TIMEOUT_MS,
              { maxHeight }
            )
          : await runYtdlpDownload(
              downloadJob.url,
              buildDownloadFlags(outputBase, downloadJob.audio, flagOpts),
              env.DOWNLOAD_TIMEOUT_MS,
              'download'
            )

      const entries = await readdir(jobDir)
      logger.info('download dir after yt-dlp', {
        jobId: downloadJob.id,
        entries,
        stderr: ytdlpResult.stderr.slice(0, 400),
      })

      info = await readInfoJson(jobDir, 'video')
      if (info) {
        validateMetadata(info, downloadJob.url)
        filePath = await resolveDownloadedPath(info, jobDir, 'video')
      } else {
        const found = await findMediaFile(jobDir, 'video', imageMode)
        if (!found) {
          const hint =
            ytdlpResult.stderr.slice(0, 300) || entries.join(', ') || 'empty'
          if (isYoutubeBotBlock(hint)) {
            throw new Error(hint)
          }
          if (isFacebookUrl(downloadJob.url) && hint.includes('Cannot parse')) {
            throw new Error('facebook_parse')
          }
          throw new Error(`Download produced no file (${hint})`)
        }
        filePath = found
      }
    }
    const fileSize = await assertFileWithinLimits(filePath)
    const description =
      typeof info?.description === 'string' ? info.description.trim() : ''
    const escapedTitle = escapeTitle(
      [info?.title, imageMode && description ? description : '']
        .filter(Boolean)
        .join('\n\n')
    )

    downloadJob.status = DownloadJobStatus.uploading
    await saveDownloadJob(downloadJob, 'uploading')

    const { doc: originalChat } = await findOrCreateChat(
      downloadJob.originalChatId
    )
    const media: SendMediaOptions = {
      audio: downloadJob.audio,
      downloadMode: downloadJob.downloadMode,
    }
    const thumbPath =
      downloadJob.audio ||
      imageMode ||
      !shouldProcessThumbnail(fileSize)
        ? undefined
        : info
          ? await getThumbnailUrl(info, jobDir, 'video', fileSize)
          : undefined

    const fileId = await withTimeout(
      sendCompletedFile(
        downloadJob.originalChatId,
        downloadJob.originalMessageId,
        originalChat.language,
        media,
        escapedTitle,
        filePath,
        thumbPath
      ),
      env.UPLOAD_TIMEOUT_MS,
      'Telegram upload'
    )

    await findOrCreateUrl(
      {
        url: downloadJob.url,
        audio: downloadJob.audio,
        downloadMode: downloadJob.downloadMode,
        maxHeight: downloadJob.maxHeight,
      },
      fileId,
      escapedTitle || 'No title'
    )
    downloadJob.status = DownloadJobStatus.finished
    await saveDownloadJob(downloadJob, 'finished')
    await markLinkLogResult(downloadJob.originalChatId, downloadJob.url, true)
    logger.info('download finished', { url: downloadJob.url, jobId: downloadJob.id })
  } catch (error) {
    metrics.increment('failedDownloads')
    recordDownloadFailure(downloadJob.originalChatId)
    if (downloadJob.status === DownloadJobStatus.downloading) {
      if (error instanceof Error) {
        if (error.message.includes('Unsupported URL')) {
          downloadJob.status = DownloadJobStatus.unsupportedUrl
        } else if (
          error.message.includes('Requested format is not available') ||
          error.message.includes('exceeds')
        ) {
          downloadJob.status = DownloadJobStatus.noSuitableVideoSize
        } else if (
          isYoutubeBotBlock(error.message) ||
          isCookieConfigurationError(error.message)
        ) {
          downloadJob.status = DownloadJobStatus.failedYoutubeBot
        } else {
          downloadJob.status = DownloadJobStatus.failedDownload
        }
      } else {
        downloadJob.status = DownloadJobStatus.failedDownload
      }
    } else if (downloadJob.status === DownloadJobStatus.uploading) {
      downloadJob.status = DownloadJobStatus.failedUpload
    }
    await saveDownloadJob(downloadJob, 'failed')
    await markLinkLogResult(
      downloadJob.originalChatId,
      downloadJob.url,
      false,
      downloadJob.status
    )
    if (error instanceof Error && isYoutubeCookiesInvalid(error.message)) {
      logger.error(
        'YouTube cookies invalid on server — export fresh cookies.txt from Chrome',
        { url: downloadJob.url }
      )
    }
    if (!isDocumentNotFound(error)) {
      report(error, { location: 'downloadUrl', meta: downloadJob.url })
    }
  } finally {
    await removePathSafe(jobDir)
  }
}
