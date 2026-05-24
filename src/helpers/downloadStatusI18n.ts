import { DownloadMode } from '@/models/DownloadMode'

/** Status message while a job is downloading (not always "video"). */
export function statusDownloadingKey(mode: DownloadMode, audio = false): string {
  if (audio) {
    return 'status_downloading_audio'
  }
  switch (mode) {
    case DownloadMode.album:
      return 'status_downloading_album'
    case DownloadMode.image:
      return 'status_downloading_image'
    case DownloadMode.file:
      return 'status_downloading_file'
    default:
      return 'status_downloading_video'
  }
}

export function chatActionForDownload(
  mode: DownloadMode,
  audio: boolean
): 'upload_voice' | 'upload_photo' | 'upload_video' | 'upload_document' {
  if (audio) {
    return 'upload_voice'
  }
  if (mode === DownloadMode.image || mode === DownloadMode.album) {
    return 'upload_photo'
  }
  if (mode === DownloadMode.file) {
    return 'upload_document'
  }
  return 'upload_video'
}
