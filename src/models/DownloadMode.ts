export enum DownloadMode {
  video = 'video',
  audio = 'audio',
  image = 'image',
  file = 'file',
  album = 'album',
}

export function parseDownloadMode(value: string): DownloadMode | undefined {
  if (value === DownloadMode.video) {
    return DownloadMode.video
  }
  if (value === DownloadMode.audio) {
    return DownloadMode.audio
  }
  if (value === DownloadMode.image) {
    return DownloadMode.image
  }
  if (value === DownloadMode.file) {
    return DownloadMode.file
  }
  if (value === DownloadMode.album) {
    return DownloadMode.album
  }
  return undefined
}
