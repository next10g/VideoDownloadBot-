import { DownloadJobModel, DownloadRequestModel } from '@/models'
import DownloadJobStatus from '@/models/DownloadJobStatus'
import env from '@/helpers/env'
import { ValidationError } from '@/lib/errors'

const ACTIVE_STATUSES = [
  DownloadJobStatus.created,
  DownloadJobStatus.downloading,
  DownloadJobStatus.uploading,
]

export async function assertUserJobLimits(
  chatId: number,
  url: string,
  audio: boolean
): Promise<void> {
  const duplicate = await findUserActiveRequestForUrl(chatId, url, audio)
  if (duplicate) {
    throw new ValidationError(
      'You already have this link in progress',
      'duplicate'
    )
  }

  const activeCount = await countUserActiveJobs(chatId)
  if (activeCount >= env.MAX_USER_ACTIVE_JOBS) {
    throw new ValidationError(
      `Maximum ${env.MAX_USER_ACTIVE_JOBS} active download(s) per user`,
      'user_limit'
    )
  }
}

async function countUserActiveJobs(chatId: number): Promise<number> {
  const requests = await DownloadRequestModel.find({ chatId })
  let count = 0
  for (const request of requests) {
    const job = await DownloadJobModel.findById(request.downloadJob)
    if (job?.status && ACTIVE_STATUSES.includes(job.status)) {
      count++
    }
  }
  return count
}

async function findUserActiveRequestForUrl(
  chatId: number,
  url: string,
  audio: boolean
) {
  const jobs = await DownloadJobModel.find({
    url,
    audio,
    status: { $in: ACTIVE_STATUSES },
  })
  for (const job of jobs) {
    const request = await DownloadRequestModel.findOne({
      chatId,
      downloadJob: job._id,
    })
    if (request) {
      return request
    }
  }
  return null
}
