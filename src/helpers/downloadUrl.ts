import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { DocumentType } from '@typegoose/typegoose'
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
import type { MediaFileStats } from '@/helpers/mediaCaption'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import withTimeout from '@/helpers/withTimeout'
import logger from '@/lib/logger'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isYoutubeUrl } from '@/helpers/youtubeUrl'
import {
  downloadFacebookDirect,
  pickFacebookStream,
  probeFacebookEmbed,
} from '@/services/facebookEmbed'
import { sanitizeFacebookUrl } from '@/services/facebookLinkMeta'
import { resolveFacebookUrl } from '@/services/resolveFacebookUrl'
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
import { downloadAlbumAsZip } from '@/helpers/downloadAlbumZip'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { recordUserDownload } from '@/helpers/userDownloadStats'
import { saveUserLink } from '@/helpers/userLibrary'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import { ytdlpErrorI18nKey } from '@/helpers/ytdlpUserMessage'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import {
  isSocialCarouselUrl,
  probeSocialImageUrls,
} from '@/helpers/socialCarousel'
import { extractAlbumImageUrls } from '@/services/albumExtract'

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

async function resolveDownloadedPath(
  info: YtDlpMetadata,
  jobDir: string,
  fileBase: string,
  allowImages: boolean
): Promise<string> {
  const hinted =
    info._filename ||
    (info.ext ? join(jobDir, `${fileBase}.${info.ext}`) : undefined)
  return resolveDownloadedMediaPath(jobDir, fileBase, allowImages, hinted)
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
    const albumMode = downloadJob.downloadMode === DownloadMode.album
    const fileMode = downloadJob.downloadMode === DownloadMode.file
    const maxHeight =
      downloadJob.maxHeight > 0 ? downloadJob.maxHeight : env.YOUTUBE_MAX_HEIGHT
    const flagOpts = {
      maxHeight,
      imageMode: imageMode || albumMode,
      fileMode,
      sourceUrl: downloadJob.url,
      preferredAudioExt: downloadJob.preferredExt || undefined,
    }
    const plainCaption = isInstagramUrl(downloadJob.url)

    logger.info('download start', {
      url: downloadJob.url,
      jobId,
      jobDir,
      mode: downloadJob.downloadMode,
      maxHeight,
      direct: Boolean(downloadJob.directStreamUrl || isFacebookUrl(downloadJob.url)),
    })

    let filePath: string
    let info: YtDlpMetadata | undefined
    let ytdlpResult = { stderr: '' }

    if (albumMode && downloadJob.albumUrls?.length) {
      filePath = await downloadAlbumAsZip(downloadJob.albumUrls, jobId)
      info = { title: 'Album' } as YtDlpMetadata
    } else {
      filePath = ''
    }

    const isSocial = isSocialCarouselUrl(downloadJob.url)

    if (!filePath && isSocial) {
      const imageUrls =
        downloadJob.albumUrls?.filter(Boolean).length
          ? downloadJob.albumUrls!
          : await probeSocialImageUrls(downloadJob.url)
      if (imageUrls.length > 1) {
        filePath = await downloadAlbumAsZip(imageUrls, jobId)
        info = { title: 'Album' } as YtDlpMetadata
      } else if (imageUrls.length === 1) {
        filePath = join(jobDir, 'video.jpg')
        await fetchImageToFile(imageUrls[0], filePath)
        info = { title: 'Photo', ext: 'jpg' } as YtDlpMetadata
      }
    }

    let directUrl = downloadJob.directStreamUrl

    if (!directUrl && isFacebookUrl(downloadJob.url)) {
      const embed = await probeFacebookEmbed(
        downloadJob.url,
        env.PIPED_API_TIMEOUT_MS
      )
      if (embed) {
        if (imageMode && embed.imageUrl) {
          directUrl = embed.imageUrl
        } else if (!imageMode) {
          const stream = pickFacebookStream(embed, maxHeight)
          directUrl = stream?.url
        }
      }
    }

    if (!filePath && directUrl) {
      const ext = imageMode ? '.jpg' : '.mp4'
      filePath = join(jobDir, `video${ext}`)
      logger.info('facebook direct download', { jobId, ext })
      await downloadFacebookDirect(
        directUrl,
        filePath,
        env.DOWNLOAD_TIMEOUT_MS
      )
      info = {
        title: 'Facebook',
        ext: ext.replace('.', ''),
      }
    } else if (!filePath) {
      ytdlpResult =
        isYoutubeUrl(downloadJob.url) && !imageMode && !fileMode && !albumMode
          ? await runYoutubeDownload(
              downloadJob.url,
              outputBase,
              downloadJob.audio,
              jobId,
              env.DOWNLOAD_TIMEOUT_MS,
              { maxHeight }
            )
          : await runYtdlpDownload(
              isFacebookUrl(downloadJob.url)
                ? sanitizeFacebookUrl(
                    await resolveFacebookUrl(downloadJob.url),
                    downloadJob.url
                  )
                : downloadJob.url,
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
        const albumUrls = extractAlbumImageUrls(info)
        if (isSocial && albumUrls.length > 1) {
          filePath = await downloadAlbumAsZip(albumUrls, jobId)
        } else if (isSocial && imageMode && albumUrls.length === 1) {
          filePath = join(jobDir, 'video.jpg')
          await fetchImageToFile(albumUrls[0], filePath)
        } else {
          validateMetadata(info, downloadJob.url)
          filePath = await resolveDownloadedPath(
            info,
            jobDir,
            'video',
            imageMode
          )
        }
      } else {
        try {
          filePath = await resolveDownloadedMediaPath(
            jobDir,
            'video',
            imageMode
          )
        } catch {
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
      }
    }
    const fileSize = await assertFileWithinLimits(filePath)
    const description =
      typeof info?.description === 'string' ? info.description.trim() : ''
    const titleRaw = [info?.title, imageMode && description ? description : '']
      .filter(Boolean)
      .join('\n\n')
    const escapedTitle = plainCaption ? titleRaw : escapeTitle(titleRaw)

    downloadJob.status = DownloadJobStatus.uploading
    await saveDownloadJob(downloadJob, 'uploading')

    const { doc: originalChat } = await findOrCreateChat(
      downloadJob.originalChatId
    )
    const media: SendMediaOptions = {
      audio: downloadJob.audio,
      downloadMode: albumMode ? DownloadMode.file : downloadJob.downloadMode,
      plainCaption,
      sourceUrl: downloadJob.url,
    }
    const thumbPath =
      downloadJob.audio ||
      imageMode ||
      !shouldProcessThumbnail(fileSize)
        ? undefined
        : info
          ? await getThumbnailUrl(info, jobDir, 'video', fileSize)
          : undefined

    const durationSec =
      typeof info?.duration === 'number' && info.duration > 0
        ? info.duration
        : undefined
    const fileStats: MediaFileStats = {
      bytes: fileSize,
      durationSec:
        downloadJob.audio || imageMode ? undefined : durationSec,
    }

    const fileId = await withTimeout(
      sendCompletedFile(
        downloadJob.originalChatId,
        downloadJob.originalMessageId,
        originalChat.language,
        media,
        escapedTitle,
        filePath,
        thumbPath,
        fileStats
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
        preferredExt: downloadJob.preferredExt,
      },
      fileId,
      escapedTitle || 'No title'
    )
    downloadJob.status = DownloadJobStatus.finished
    await saveDownloadJob(downloadJob, 'finished')
    await markLinkLogResult(downloadJob.originalChatId, downloadJob.url, true)
    await recordUserDownload(
      downloadJob.originalChatId,
      fileSize,
      downloadJob.downloadMode
    )
    await saveUserLink(downloadJob.originalChatId, downloadJob.url, {
      title: titleRaw,
      downloadMode: downloadJob.downloadMode,
      bytes: fileSize,
    })
    logger.info('download finished', { url: downloadJob.url, jobId: downloadJob.id })
  } catch (error) {
    metrics.increment('failedDownloads')
    recordDownloadFailure(downloadJob.originalChatId)
    if (error instanceof Error) {
      const msg = error.message
      const i18nKey =
        ytdlpErrorI18nKey(msg) ||
        (msg.toLowerCase().includes('no video in this post')
          ? 'error_instagram_photo_only'
          : undefined)
      if (i18nKey) {
        downloadJob.failureI18nKey = i18nKey
      }
    }
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
