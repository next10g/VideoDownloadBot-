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
import { buildDownloadFlags } from '@/services/ytdlpOptions'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
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

async function findMediaFile(
  jobDir: string,
  fileBase: string
): Promise<string | undefined> {
  const entries = await readdir(jobDir)
  const media = entries.filter(
    (name) =>
      name.startsWith(`${fileBase}.`) &&
      !name.endsWith('.info.json') &&
      !name.endsWith('.jpg') &&
      !name.endsWith('.webp') &&
      !name.endsWith('.png')
  )
  if (media.length === 1) {
    return join(jobDir, media[0])
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
  const fileBase = `file-${Date.now()}`
  let jobDir = ''
  try {
    jobDir = await createJobTempDir(fileBase)
    const outputBase = join(jobDir, fileBase)
    const options = buildDownloadFlags(outputBase, downloadJob.audio)

    logger.info('download start', { url: downloadJob.url, jobId: downloadJob.id })
    await runYtdlpDownload(
      downloadJob.url,
      options,
      env.DOWNLOAD_TIMEOUT_MS,
      'download'
    )

    const info = await readInfoJson(jobDir, fileBase)
    let filePath: string
    if (info) {
      validateMetadata(info, downloadJob.url)
      filePath = await resolveDownloadedPath(info, jobDir, fileBase)
    } else {
      const found = await findMediaFile(jobDir, fileBase)
      if (!found) {
        throw new Error('Download finished but no media or .info.json found')
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
          ? await getThumbnailUrl(info, jobDir, fileBase, fileSize)
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
