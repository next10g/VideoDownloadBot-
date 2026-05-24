import { DownloadMode } from '@/models/DownloadMode'
import { DownloadJobModel } from '@/models'

export interface DownloadJobOptions {
  audio: boolean
  downloadMode?: DownloadMode
  maxHeight?: number
  preferredExt?: string
  directStreamUrl?: string
  albumUrls?: string[]
}

export function findOrCreateDownloadJob(
  url: string,
  options: DownloadJobOptions,
  originalChatId: number,
  originalMessageId: number
) {
  const downloadMode = options.downloadMode ?? DownloadMode.video
  const maxHeight = options.maxHeight ?? 0
  const preferredExt = options.preferredExt ?? ''
  const audio =
    options.audio || downloadMode === DownloadMode.audio

  return DownloadJobModel.findOrCreate(
    { url, audio, downloadMode, maxHeight, preferredExt },
    {
      originalChatId,
      originalMessageId,
      downloadMode,
      maxHeight,
      preferredExt,
      directStreamUrl: options.directStreamUrl,
      albumUrls: options.albumUrls,
    }
  )
}

export function deleteDownloadJob(
  url: string,
  options: DownloadJobOptions
) {
  const downloadMode = options.downloadMode ?? DownloadMode.video
  const maxHeight = options.maxHeight ?? 0
  const preferredExt = options.preferredExt ?? ''
  const audio =
    options.audio || downloadMode === DownloadMode.audio
  return DownloadJobModel.deleteMany({
    url,
    audio,
    downloadMode,
    maxHeight,
    preferredExt,
  })
}

export function findAllDownloadJobs() {
  return DownloadJobModel.find({})
}

export function deleteAllDownloadJobs(
  filter: Record<string, unknown> = {}
) {
  return DownloadJobModel.deleteMany(filter)
}
