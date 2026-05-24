import { DownloadMode } from '@/models/DownloadMode'

export interface SendMediaOptions {
  audio: boolean
  downloadMode: DownloadMode
}

export function isImageMode(opts: SendMediaOptions): boolean {
  return opts.downloadMode === DownloadMode.image
}
