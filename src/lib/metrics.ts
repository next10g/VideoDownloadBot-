export interface MetricsSnapshot {
  totalDownloads: number
  cacheHits: number
  failedDownloads: number
  uploadFailures: number
  queueWaits: number
  uploadsCompleted: number
}

const state: MetricsSnapshot = {
  totalDownloads: 0,
  cacheHits: 0,
  failedDownloads: 0,
  uploadFailures: 0,
  queueWaits: 0,
  uploadsCompleted: 0,
}

export const metrics = {
  increment(key: keyof MetricsSnapshot, by = 1): void {
    state[key] += by
  },
  snapshot(): MetricsSnapshot {
    return { ...state }
  },
}
