import { DownloadRequestModel } from '@/models'
import { findOrCreateChat } from '@/models/Chat'
import { findUrl } from '@/models/Url'
import DownloadJob from '@/models/DownloadJob'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import MessageEditor from '@/helpers/MessageEditor'
import { buildRetryKeyboard } from '@/helpers/progressKeyboard'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import i18n from '@/helpers/i18n'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import type { SendMediaOptions } from '@/helpers/sendMediaOptions'

export async function findOrCreateDownloadRequest(
  chatId: number,
  messageId: number,
  downloadJob: DownloadJob
) {
  if (
    downloadJob.status === DownloadJobStatus.created ||
    downloadJob.status === DownloadJobStatus.downloading
  ) {
    return DownloadRequestModel.findOrCreate({
      chatId,
      messageId,
      downloadJob,
    })
  }
  const editor = new MessageEditor(messageId, undefined, chatId)
  const { doc } = await findOrCreateChat(chatId)
  switch (downloadJob.status) {
    case DownloadJobStatus.uploading:
      await editor.editMessage(i18n.t(doc.language, 'status_uploading'))
      break
    case DownloadJobStatus.failedDownload:
      await editor.editMessage(
        i18n.t(
          doc.language,
          isFacebookUrl(downloadJob.url)
            ? 'error_facebook_download'
            : 'error_video_download'
        ),
        buildRetryKeyboard(doc.language)
      )
      break
    case DownloadJobStatus.failedUpload:
      await editor.editMessage(
        i18n.t(doc.language, 'error_video_upload'),
        buildRetryKeyboard(doc.language)
      )
      break
    case DownloadJobStatus.unsupportedUrl:
      await editor.editMessage(
        i18n.t(doc.language, 'error_unsupported_url'),
        buildRetryKeyboard(doc.language)
      )
      break
    case DownloadJobStatus.noSuitableVideoSize:
      await editor.editMessage(
        i18n.t(doc.language, 'error_no_suitable_video_size'),
        buildRetryKeyboard(doc.language)
      )
      break
    case DownloadJobStatus.failedYoutubeBot:
      await editor.editMessage(
        i18n.t(doc.language, 'error_youtube_bot'),
        buildRetryKeyboard(doc.language)
      )
      break
    case DownloadJobStatus.finished: {
      const url = await findUrl({
        url: downloadJob.url,
        audio: downloadJob.audio,
        downloadMode: downloadJob.downloadMode,
        maxHeight: downloadJob.maxHeight,
        preferredExt: downloadJob.preferredExt ?? '',
      })
      if (!url) {
        throw new Error('Cached url not found')
      }
      await editor.editMessage(i18n.t(doc.language, 'status_completed'))
      const media: SendMediaOptions = {
        audio: url.audio,
        downloadMode: url.downloadMode,
      }
      await sendCompletedFile(
        chatId,
        messageId,
        doc.language,
        media,
        url.title,
        url.fileId
      )
      return
    }
  }
  return DownloadRequestModel.findOrCreate({
    chatId,
    messageId,
    downloadJob,
  })
}

export function findDownloadRequestsForDownloadJob(downloadJob: DownloadJob) {
  return DownloadRequestModel.find({ downloadJob })
}

export function deleteDownloadRequest(chatId: number, messageId: number) {
  return DownloadRequestModel.deleteMany({ chatId, messageId })
}

export function deleteAllDownloadRequests() {
  return DownloadRequestModel.deleteMany({})
}
