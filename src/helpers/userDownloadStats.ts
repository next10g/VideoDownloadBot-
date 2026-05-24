import { ChatModel } from '@/models/Chat'
import { DownloadMode } from '@/models/DownloadMode'

export function fileTypeKey(mode: DownloadMode, ext?: string): string {
  if (mode === DownloadMode.file) {
    return ext ? `file:${ext}` : 'file'
  }
  return mode
}

export async function recordUserDownload(
  telegramId: number,
  bytes: number,
  mode: DownloadMode,
  ext?: string
): Promise<void> {
  if (bytes <= 0) {
    return
  }
  const key = fileTypeKey(mode, ext).replace(/\./g, '_')
  await ChatModel.updateOne(
    { telegramId },
    {
      $inc: {
        totalBytesDownloaded: bytes,
        successDownloadCount: 1,
        [`fileTypeCounts.${key}`]: 1,
      },
    }
  ).exec()
}

export function formatBytesGb(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
