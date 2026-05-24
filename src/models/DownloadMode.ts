export enum DownloadMode {
  video = 'video',
  audio = 'audio',
  image = 'image',
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
  return undefined
}
