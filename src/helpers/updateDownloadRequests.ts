import { Chat, findOrCreateChat } from '@/models/Chat'
import { DocumentType } from '@typegoose/typegoose'
import { findDownloadRequestsForDownloadJob } from '@/models/downloadRequestFunctions'
import { findUrl } from '@/models/Url'
import { DownloadMode } from '@/models/DownloadMode'
import type { SendMediaOptions } from '@/helpers/sendMediaOptions'
import DownloadJob from '@/models/DownloadJob'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import DownloadRequest from '@/models/DownloadRequest'
import MessageEditor from '@/helpers/MessageEditor'
import { buildRetryKeyboard } from '@/helpers/progressKeyboard'
import {
  recordDownloadFailure,
  recordDownloadSuccess,
} from '@/helpers/userAbuse'
import i18n from '@/helpers/i18n'
import report from '@/helpers/report'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import { metrics } from '@/lib/metrics'

type ChatMap = { [chatId: number]: Chat }

const FAILURE_STATUSES = new Set([
  DownloadJobStatus.failedDownload,
  DownloadJobStatus.failedUpload,
  DownloadJobStatus.unsupportedUrl,
  DownloadJobStatus.noSuitableVideoSize,
  DownloadJobStatus.failedYoutubeBot,
])

async function getDownloadRequestsChatsAndEditors(
  downloadJob: DocumentType<DownloadJob>
) {
  const requests = await findDownloadRequestsForDownloadJob(downloadJob)
  const chats: ChatMap = {}
  for (const request of requests) {
    if (!chats[request.chatId]) {
      const { doc: chat } = await findOrCreateChat(request.chatId)
      chats[request.chatId] = chat
    }
  }
  const editors = requests.map(
    (request) => new MessageEditor(request.messageId, undefined, request.chatId)
  )
  return { requests, chats, editors }
}

async function updateMessages(
  editors: MessageEditor[],
  chats: ChatMap,
  localizationKey: string,
  withRetry = false
) {
  for (const editor of editors) {
    const chat = editor.chatId && chats[editor.chatId]
    if (!chat) {
      continue
    }
    const text = i18n.t(chat.language, localizationKey)
    const keyboard = withRetry ? buildRetryKeyboard(chat.language) : undefined
    await editor.editMessage(text, keyboard)
  }
}

async function sendFileToNonOriginalRequests(
  downloadJob: DocumentType<DownloadJob>,
  requests: DocumentType<DownloadRequest>[],
  chats: ChatMap
) {
  const otherRequests = requests.filter(
    (request) =>
      request.chatId !== downloadJob.originalChatId &&
      request.messageId !== downloadJob.originalMessageId
  )
  if (!otherRequests.length) {
    return
  }
  const cachedUrl = await findUrl({
    url: downloadJob.url,
    audio: downloadJob.audio,
    downloadMode: downloadJob.downloadMode ?? DownloadMode.video,
    maxHeight: downloadJob.maxHeight ?? 0,
    preferredExt: downloadJob.preferredExt ?? '',
  })
  if (!cachedUrl) {
    throw new Error('Cached url not found')
  }
  for (const request of otherRequests) {
    const chat = chats[request.chatId]
    try {
      const media: SendMediaOptions = {
        audio: downloadJob.audio,
        downloadMode: downloadJob.downloadMode ?? DownloadMode.video,
      }
      await sendCompletedFile(
        request.chatId,
        request.messageId,
        chat.language,
        media,
        cachedUrl.title,
        cachedUrl.fileId
      )
      recordDownloadSuccess(request.chatId)
    } catch (error) {
      report(error, { location: 'sendFileToNonOriginalRequests' })
      recordDownloadFailure(request.chatId)
    }
  }
}

async function deleteDocuments(
  downloadJob: DocumentType<DownloadJob>,
  requests: DocumentType<DownloadRequest>[]
) {
  for (const request of requests) {
    try {
      await request.delete()
    } catch (error) {
      report(error, { location: 'deleteDocuments.request' })
    }
  }
  try {
    await downloadJob.delete()
  } catch (error) {
    report(error, { location: 'deleteDocuments.job' })
  }
}

function failureMessageKey(status: DownloadJobStatus): string {
  switch (status) {
    case DownloadJobStatus.failedUpload:
      return 'error_video_upload'
    case DownloadJobStatus.unsupportedUrl:
      return 'error_unsupported_url'
    case DownloadJobStatus.noSuitableVideoSize:
      return 'error_no_suitable_video_size'
    case DownloadJobStatus.failedYoutubeBot:
      return 'error_youtube_bot'
    default:
      return 'error_video_download'
  }
}

export default async function updateDownloadRequests(
  downloadJob: DocumentType<DownloadJob>
) {
  if (downloadJob.status === DownloadJobStatus.created) {
    return
  }
  const { requests, chats, editors } = await getDownloadRequestsChatsAndEditors(
    downloadJob
  )

  if (FAILURE_STATUSES.has(downloadJob.status)) {
    metrics.increment('failedDownloads')
    for (const request of requests) {
      recordDownloadFailure(request.chatId)
    }
    await updateMessages(
      editors,
      chats,
      failureMessageKey(downloadJob.status),
      true
    )
    await deleteDocuments(downloadJob, requests)
    return
  }

  switch (downloadJob.status) {
    case DownloadJobStatus.uploading:
      await updateMessages(editors, chats, 'status_uploading')
      break
    case DownloadJobStatus.finished:
      metrics.increment('totalDownloads')
      for (const request of requests) {
        recordDownloadSuccess(request.chatId)
      }
      await updateMessages(editors, chats, 'status_completed')
      await sendFileToNonOriginalRequests(downloadJob, requests, chats)
      await deleteDocuments(downloadJob, requests)
      break
  }
}
