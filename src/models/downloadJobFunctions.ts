import { DownloadJobModel } from '@/models'

export function findOrCreateDownloadJob(
  url: string,
  audio: boolean,
  originalChatId: number,
  originalMessageId: number
) {
  return DownloadJobModel.findOrCreate(
    { url, audio },
    { originalChatId, originalMessageId }
  )
}

export function deleteDownloadJob(url: string, audio: boolean) {
  return DownloadJobModel.deleteMany({ url, audio })
}

export function findAllDownloadJobs() {
  return DownloadJobModel.find({})
}

export function deleteAllDownloadJobs(
  filter: Record<string, unknown> = {}
) {
  return DownloadJobModel.deleteMany(filter)
}
