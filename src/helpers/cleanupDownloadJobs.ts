import {
  deleteAllDownloadJobs,
  findAllDownloadJobs,
} from '@/models/downloadJobFunctions'
import {
  deleteAllDownloadRequests,
  findDownloadRequestsForDownloadJob,
} from '@/models/downloadRequestFunctions'
import { findOrCreateChat } from '@/models/Chat'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import bot from '@/helpers/bot'
import downloadQueue from '@/helpers/downloadQueue'
import i18n from '@/helpers/i18n'
import report from '@/helpers/report'

export default async function cleanupDownloadJobs() {
  const downloadJobs = await findAllDownloadJobs()
  const rebootStatuses = new Set([
    DownloadJobStatus.uploading,
    DownloadJobStatus.created,
  ])

  for (const downloadJob of downloadJobs) {
    if (downloadJob.status === DownloadJobStatus.downloading) {
      downloadQueue.enqueue(String(downloadJob._id))
      continue
    }

    if (!rebootStatuses.has(downloadJob.status)) {
      continue
    }

    const downloadRequests = await findDownloadRequestsForDownloadJob(
      downloadJob
    )
    for (const downloadRequest of downloadRequests) {
      const { doc: chat } = await findOrCreateChat(downloadRequest.chatId)
      try {
        await bot.api.editMessageText(
          chat.telegramId,
          downloadRequest.messageId,
          i18n.t(chat.language, 'error_reboot')
        )
      } catch (error) {
        report(error, { location: 'cleanupDownloadJobs' })
      }
    }
  }

  await deleteAllDownloadJobs({
    status: {
      $in: [
        DownloadJobStatus.created,
        DownloadJobStatus.uploading,
        DownloadJobStatus.finished,
        DownloadJobStatus.failedDownload,
        DownloadJobStatus.failedUpload,
        DownloadJobStatus.unsupportedUrl,
        DownloadJobStatus.noSuitableVideoSize,
      ],
    },
  })
  await deleteAllDownloadRequests()
}
