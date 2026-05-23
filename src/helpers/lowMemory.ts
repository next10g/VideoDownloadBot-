import env from '@/helpers/env'

export function isLowMemoryMode(fileSizeBytes: number): boolean {
  if (env.LOW_MEMORY_MODE === 'on') {
    return true
  }
  if (env.LOW_MEMORY_MODE === 'off') {
    return false
  }
  return fileSizeBytes >= env.LOW_MEMORY_THRESHOLD_BYTES
}

export function shouldProcessThumbnail(fileSizeBytes: number): boolean {
  if (env.SKIP_THUMBNAILS) {
    return false
  }
  return !isLowMemoryMode(fileSizeBytes)
}
