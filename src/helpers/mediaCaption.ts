export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export interface MediaFileStats {
  bytes?: number
  durationSec?: number
}

export function buildFileStatsLine(stats: MediaFileStats): string {
  const parts: string[] = []
  if (stats.bytes && stats.bytes > 0) {
    parts.push(`📦 ${formatFileSize(stats.bytes)}`)
  }
  if (stats.durationSec && stats.durationSec > 0) {
    parts.push(`⏱ ${formatDuration(stats.durationSec)}`)
  }
  return parts.join(' · ')
}
