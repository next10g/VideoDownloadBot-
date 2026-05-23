import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { DocumentType } from '@typegoose/typegoose'
import { InputFile } from 'grammy'
import { findOrCreateChat } from '@/models/Chat'
import { findOrCreateUrl } from '@/models/Url'
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
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import { buildDownloadFlags } from '@/services/ytdlpOptions'
import { runYoutubeDownload } from '@/services/youtubeDownload'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import {
  isCookieConfigurationError,
  isYoutubeBotBlock,
} from '@/services/ytdlpCookies'
import { validateMetadata } from '@/services/ytdlpProbe'

function escapeTitle(title: string | undefined): string {
  return (title || '').replace('<', '&lt;').replace('>', '&gt;')
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

function isMediaFile(name: string): boolean {
  if (name.endsWith('.part') || name.endsWith('.info.json')) {
    return false
  }
  if (name.endsWith('.jpg') || name.endsWith('.webp') || name.endsWith('.png')) {
    return false
  }
  return MEDIA_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
}

async function findMediaFile(
  jobDir: string,
  fileBase: string
): Promise<string | undefined> {
  const entries = await readdir(jobDir)
  const prefixed = entries.filter(
    (name) => name.startsWith(`${fileBase}.`) && isMediaFile(name)
  )
  if (prefixed.length === 1) {
    return join(jobDir, prefixed[0])
  }
  const any = entries.filter(isMediaFile)
  if (any.length === 1) {
    return join(jobDir, any[0])
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
  const found = await findMediaFile(jobDir, fileBase)
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

    logger.info('download start', { url: downloadJob.url, jobId, jobDir })
    const ytdlpResult = isYoutubeUrl(downloadJob.url)
      ? await runYoutubeDownload(
          downloadJob.url,
          outputBase,
          downloadJob.audio,
          jobId,
          env.DOWNLOAD_TIMEOUT_MS
        )
      : await runYtdlpDownload(
          downloadJob.url,
          buildDownloadFlags(outputBase, downloadJob.audio),
          env.DOWNLOAD_TIMEOUT_MS,
          'download'
        )

    const entries = await readdir(jobDir)
    logger.info('download dir after yt-dlp', {
      jobId: downloadJob.id,
      entries,
      stderr: ytdlpResult.stderr.slice(0, 400),
    })

    const info = await readInfoJson(jobDir, 'video')
    let filePath: string
    if (info) {
      validateMetadata(info, downloadJob.url)
      filePath = await resolveDownloadedPath(info, jobDir, 'video')
    } else {
      const found = await findMediaFile(jobDir, 'video')
      if (!found) {
        const hint = ytdlpResult.stderr.slice(0, 300) || entries.join(', ') || 'empty'
        if (isYoutubeBotBlock(hint)) {
          throw new Error(hint)
        }
        throw new Error(`Download produced no file (${hint})`)
      }
      filePath = found
    }
    const fileSize = await assertFileWithinLimits(filePath)
    const escapedTitle = escapeTitle(info?.title)

    downloadJob.status = DownloadJobStatus.uploading
    await downloadJob.save()

    const { doc: originalChat } = await findOrCreateChat(
      downloadJob.originalChatId
    )
    const thumbPath =
      downloadJob.audio || !shouldProcessThumbnail(fileSize)
        ? undefined
        : info
          ? await getThumbnailUrl(info, jobDir, 'video', fileSize)
          : undefined

    const fileId = await withTimeout(
      sendCompletedFile(
        downloadJob.originalChatId,
        downloadJob.originalMessageId,
        originalChat.language,
        downloadJob.audio,
        escapedTitle,
        filePath,
        thumbPath
      ),
      env.UPLOAD_TIMEOUT_MS,
      'Telegram upload'
    )

    await findOrCreateUrl(
      downloadJob.url,
      fileId,
      downloadJob.audio,
      escapedTitle || 'No title'
    )
    downloadJob.status = DownloadJobStatus.finished
    await downloadJob.save()
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
    await downloadJob.save()
    report(error, { location: 'downloadUrl', meta: downloadJob.url })
  } finally {
    await removePathSafe(jobDir)
  }
}
