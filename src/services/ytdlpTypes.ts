export interface YtDlpMetadata {
  title?: string
  description?: string
  ext?: string
  extractor?: string
  extractor_key?: string
  duration?: number
  filesize?: number
  filesize_approx?: number
  is_live?: boolean
  live_status?: string
  _type?: string
  _filename?: string
  entries?: YtDlpMetadata[]
  thumbnails?: {
    url?: string
    height?: number
    width?: number
  }[]
  format?: string
}

export type YtDlpFlags = Record<string, unknown>
