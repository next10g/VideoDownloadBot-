import { DownloadMode } from '@/models/DownloadMode'

export interface SendMediaOptions {
  audio: boolean
  downloadMode: DownloadMode
  /** No bot username / promo line (e.g. Instagram). */
  plainCaption?: boolean
  sourceUrl?: string
}

export function isImageMode(opts: SendMediaOptions): boolean {
  return (
    opts.downloadMode === DownloadMode.image ||
    opts.downloadMode === DownloadMode.album
  )
}

export function isDocumentMode(opts: SendMediaOptions): boolean {
  return opts.downloadMode === DownloadMode.file
}
