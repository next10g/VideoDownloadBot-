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
import { buildDownloadFlags, SOCIAL_IMAGE_FORMAT } from '@/services/ytdlpOptions'
import { runYoutubeDownload } from '@/services/youtubeDownload'
import { runYtdlpDownload } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import {
  isCookieConfigurationError,
  isYoutubeBotBlock,
  isYoutubeCookiesInvalid,
} from '@/services/ytdlpCookies'
import { validateMetadata } from '@/services/ytdlpProbe'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { recordUserDownload } from '@/helpers/userDownloadStats'
import { saveUserLink } from '@/helpers/userLibrary'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import { ytdlpErrorI18nKey } from '@/helpers/ytdlpUserMessage'
import {
  isSocialCarouselUrl,
  probeSocialImageUrls,
} from '@/helpers/socialCarousel'
import { downloadImagesToDir } from '@/helpers/downloadSocialImages'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import {
  downloadInstagramCdnImage,
  shouldUseInstagramDownloaders,
} from '@/helpers/instagramImageDownload'
import { sendPhotoAlbum } from '@/helpers/sendPhotoAlbum'
import { collectImageUrlsFromInfo } from '@/helpers/extractImageUrlsFromInfo'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import { isInstagramReelUrl } from '@/helpers/instagramUrl'

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

const IMAGE_ONLY_FORMAT = SOCIAL_IMAGE_FORMAT

type ImageDelivery =
  | { kind: 'single'; path: string }
  | { kind: 'album'; paths: string[] }

async function resolveFromInfoJsonOnly(
  info: YtDlpMetadata,
  jobDir: string,
  pageUrl: string,
  wantImages: boolean
): Promise<ImageDelivery | undefined> {
  if (!wantImages) {
    return undefined
  }
  const urls = await collectImageUrlsFromInfo(info, pageUrl)
  if (urls.length > 1) {
    return {
      kind: 'album',
      paths: await downloadImagesToDir(urls, jobDir, pageUrl),
    }
  }
  if (urls.length === 1) {
    const dest = join(jobDir, 'video.jpg')
    const downloaded = shouldUseInstagramDownloaders(pageUrl)
      ? await downloadInstagramCdnImage(urls[0], pageUrl, dest, jobDir, 'video')
      : await fetchImageToFile(urls[0], dest)
    return {
      kind: 'single',
      path: await prepareTelegramPhoto(downloaded, jobDir),
    }
  }
  if (info.entries?.length && info.entries.length > 1) {
    const entryPaths = await downloadCarouselEntriesFromInfo(info, jobDir)
    if (entryPaths.length > 1) {
      return { kind: 'album', paths: entryPaths }
    }
    if (entryPaths.length === 1) {
      return { kind: 'single', path: entryPaths[0] }
    }
  }
  return undefined
}

async function deliverSocialImages(
  pageUrl: string,
  jobDir: string,
  wantImages: boolean
): Promise<ImageDelivery | undefined> {
  if (!wantImages || !isSocialCarouselUrl(pageUrl)) {
    return undefined
  }
  const urls = await probeSocialImageUrls(pageUrl)
  if (urls.length > 1) {
    return {
      kind: 'album',
      paths: await downloadImagesToDir(urls, jobDir, pageUrl),
    }
  }
  if (urls.length === 1) {
    const dest = join(jobDir, 'video.jpg')
    const downloaded = shouldUseInstagramDownloaders(pageUrl)
      ? await downloadInstagramCdnImage(urls[0], pageUrl, dest, jobDir, 'video')
      : await fetchImageToFile(urls[0], dest)
    return {
      kind: 'single',
      path: await prepareTelegramPhoto(downloaded, jobDir),
    }
  }
  return undefined
}

async function downloadCarouselEntriesFromInfo(
  info: YtDlpMetadata,
  jobDir: string
): Promise<string[]> {
  const entries = info.entries || []
  const urls = entries
    .map((entry) => {
      const row = entry as YtDlpMetadata & { webpage_url?: string; url?: string }
      return row.webpage_url || row.url || ''
    })
    .filter(Boolean)
    .slice(0, env.ALBUM_MAX_IMAGES)

  const paths: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const entryOutput = join(jobDir, `entry-${i}`)
    try {
      await runYtdlpDownload(
        urls[i],
        {
          ...buildDownloadFlags(entryOutput, false, {
            imageMode: true,
            sourceUrl: urls[i],
          }),
          format: SOCIAL_IMAGE_FORMAT,
          writeInfoJson: false,
        },
        env.DOWNLOAD_TIMEOUT_MS,
        `entry-${i + 1}`
      )
      paths.push(await resolveDownloadedMediaPath(jobDir, `entry-${i}`, true))
    } catch {
      // skip failed slide
    }
  }
  return paths
}

async function tryDownloadSidecarAudio(
  url: string,
  jobDir: string
): Promise<string | undefined> {
  try {
    const audioBase = join(jobDir, 'carousel-audio')
    await runYtdlpDownload(
      url,
      buildDownloadFlags(audioBase, true, {
        sourceUrl: url,
        imageMode: false,
      }),
      env.DOWNLOAD_TIMEOUT_MS,
      'carousel-audio'
    )
    return resolveDownloadedMediaPath(jobDir, 'carousel-audio', false)
  } catch {
    return undefined
  }
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
    const wantImages = imageMode || albumMode
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

    let filePath = ''
    let photoPaths: string[] | undefined
    let info: YtDlpMetadata | undefined
    let ytdlpResult = { stderr: '' }

    const isSocial = isSocialCarouselUrl(downloadJob.url)

    if (albumMode && downloadJob.albumUrls?.length) {
      if (downloadJob.albumUrls.length === 1) {
        const dest = join(jobDir, 'video.jpg')
        const downloaded = shouldUseInstagramDownloaders(downloadJob.url)
          ? await downloadInstagramCdnImage(
              downloadJob.albumUrls[0],
              downloadJob.url,
              dest,
              jobDir,
              'video'
            )
          : await fetchImageToFile(downloadJob.albumUrls![0], dest)
        filePath = await prepareTelegramPhoto(downloaded, jobDir)
        info = { title: 'Photo', ext: 'jpg' } as YtDlpMetadata
      } else {
        photoPaths = await downloadImagesToDir(
          downloadJob.albumUrls,
          jobDir,
          downloadJob.url
        )
        info = { title: 'Album' } as YtDlpMetadata
      }
    }

    if (!filePath && !photoPaths?.length && isSocial && wantImages) {
      const imageUrls =
        downloadJob.albumUrls?.filter(Boolean).length
          ? downloadJob.albumUrls!
          : await probeSocialImageUrls(downloadJob.url)
      if (imageUrls.length > 1) {
        photoPaths = await downloadImagesToDir(
          imageUrls,
          jobDir,
          downloadJob.url
        )
        info = { title: 'Album' } as YtDlpMetadata
      } else if (imageUrls.length === 1) {
        const dest = join(jobDir, 'video.jpg')
        const downloaded = shouldUseInstagramDownloaders(downloadJob.url)
          ? await downloadInstagramCdnImage(
              imageUrls[0],
              downloadJob.url,
              dest,
              jobDir,
              'video'
            )
          : await fetchImageToFile(imageUrls[0], dest)
        filePath = await prepareTelegramPhoto(downloaded, jobDir)
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
    } else if (!filePath && !photoPaths?.length) {
      if (isYoutubeUrl(downloadJob.url) && !imageMode && !fileMode && !albumMode) {
        ytdlpResult = await runYoutubeDownload(
          downloadJob.url,
          outputBase,
          downloadJob.audio,
          jobId,
          env.DOWNLOAD_TIMEOUT_MS,
          { maxHeight }
        )
      } else {
        const targetUrl = isFacebookUrl(downloadJob.url)
          ? sanitizeFacebookUrl(
              await resolveFacebookUrl(downloadJob.url),
              downloadJob.url
            )
          : downloadJob.url
        try {
          ytdlpResult = await runYtdlpDownload(
            targetUrl,
            buildDownloadFlags(outputBase, downloadJob.audio, flagOpts),
            env.DOWNLOAD_TIMEOUT_MS,
            'download'
          )
        } catch (error) {
          const detail = error instanceof Error ? error.message.toLowerCase() : ''
          if (detail.includes('no video in this post')) {
            ytdlpResult = await runYtdlpDownload(
              targetUrl,
              {
                ...buildDownloadFlags(outputBase, false, {
                  ...flagOpts,
                  imageMode: true,
                }),
                format: IMAGE_ONLY_FORMAT,
                writeInfoJson: true,
              },
              env.DOWNLOAD_TIMEOUT_MS,
              'download-images-fallback'
            )
          } else {
            throw error
          }
        }
      }

      const entries = await readdir(jobDir)
      logger.info('download dir after yt-dlp', {
        jobId: downloadJob.id,
        entries,
        stderr: ytdlpResult.stderr.slice(0, 400),
      })

      info = await readInfoJson(jobDir, 'video')
      if (info) {
        const fromInfoOnly = await resolveFromInfoJsonOnly(
          info,
          jobDir,
          downloadJob.url,
          wantImages
        )
        if (fromInfoOnly?.kind === 'album') {
          photoPaths = fromInfoOnly.paths
        } else if (fromInfoOnly?.kind === 'single') {
          filePath = fromInfoOnly.path
        } else {
          try {
            validateMetadata(info, downloadJob.url)
            filePath = await resolveDownloadedPath(
              info,
              jobDir,
              'video',
              imageMode
            )
          } catch {
            const retry = await resolveFromInfoJsonOnly(
              info,
              jobDir,
              downloadJob.url,
              wantImages
            )
            if (retry?.kind === 'album') {
              photoPaths = retry.paths
            } else if (retry?.kind === 'single') {
              filePath = retry.path
            } else {
              const social = await deliverSocialImages(
                downloadJob.url,
                jobDir,
                wantImages
              )
              if (social?.kind === 'album') {
                photoPaths = social.paths
              } else if (social?.kind === 'single') {
                filePath = social.path
              } else {
                throw new Error('Could not resolve downloaded file path')
              }
            }
          }
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
          if (isSocial && wantImages) {
            const urls = await probeSocialImageUrls(downloadJob.url)
            if (urls.length > 1) {
              photoPaths = await downloadImagesToDir(
                urls,
                jobDir,
                downloadJob.url
              )
            } else if (urls.length === 1) {
              const dest = join(jobDir, 'video.jpg')
              const downloaded = shouldUseInstagramDownloaders(downloadJob.url)
                ? await downloadInstagramCdnImage(
                    urls[0],
                    downloadJob.url,
                    dest,
                    jobDir,
                    'video'
                  )
                : await fetchImageToFile(urls[0], dest)
              filePath = await prepareTelegramPhoto(downloaded, jobDir)
            } else {
              const social = await deliverSocialImages(
                downloadJob.url,
                jobDir,
                wantImages
              )
              if (social?.kind === 'album') {
                photoPaths = social.paths
              } else if (social?.kind === 'single') {
                filePath = social.path
              } else {
                throw new Error(`Download produced no file (${hint})`)
              }
            }
          } else if (isYoutubeBotBlock(hint)) {
            throw new Error(hint)
          } else if (
            isFacebookUrl(downloadJob.url) &&
            hint.includes('Cannot parse')
          ) {
            throw new Error('facebook_parse')
          } else {
            throw new Error(`Download produced no file (${hint})`)
          }
        }
      }
    }

    if (photoPaths?.length) {
      downloadJob.status = DownloadJobStatus.uploading
      await saveDownloadJob(downloadJob, 'uploading')

      const { doc: originalChat } = await findOrCreateChat(
        downloadJob.originalChatId
      )
      const fileIds = await sendPhotoAlbum(
        downloadJob.originalChatId,
        downloadJob.originalMessageId,
        photoPaths
      )
      const totalBytes = (
        await Promise.all(photoPaths.map((p) => assertFileWithinLimits(p)))
      ).reduce((a, b) => a + b, 0)

      const audioPath =
        photoPaths.length > 1 &&
        !isInstagramReelUrl(downloadJob.url) &&
        isInstagramUrl(downloadJob.url)
          ? await tryDownloadSidecarAudio(downloadJob.url, jobDir)
          : undefined
      if (audioPath) {
        await sendCompletedFile(
          downloadJob.originalChatId,
          downloadJob.originalMessageId,
          originalChat.language,
          { audio: true, downloadMode: DownloadMode.audio, plainCaption },
          info?.title || 'Audio',
          audioPath
        )
      }

      await findOrCreateUrl(
        {
          url: downloadJob.url,
          audio: false,
          downloadMode: downloadJob.downloadMode,
          maxHeight: downloadJob.maxHeight,
          preferredExt: downloadJob.preferredExt,
        },
        fileIds[0] || '',
        info?.title || 'Album'
      )
      downloadJob.status = DownloadJobStatus.finished
      await saveDownloadJob(downloadJob, 'finished')
      await markLinkLogResult(downloadJob.originalChatId, downloadJob.url, true)
      await recordUserDownload(
        downloadJob.originalChatId,
        totalBytes,
        downloadJob.downloadMode
      )
      await saveUserLink(downloadJob.originalChatId, downloadJob.url, {
        title: info?.title || 'Album',
        downloadMode: downloadJob.downloadMode,
        bytes: totalBytes,
      })
      logger.info('download finished (photo album)', {
        url: downloadJob.url,
        jobId: downloadJob.id,
        count: photoPaths.length,
      })
      return
    }

    if (!filePath) {
      throw new Error('Could not resolve downloaded file path')
    }

    const fileSize = await assertFileWithinLimits(filePath)
    if (!wantImages) {
      if (/\.(jpe?g|webp|png|gif)$/i.test(filePath)) {
        throw new Error('Download produced image instead of video')
      }
      if (isInstagramReelUrl(downloadJob.url) && fileSize < 80_000) {
        throw new Error('Instagram reel download produced thumbnail only')
      }
    }
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
      downloadMode: downloadJob.downloadMode,
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
