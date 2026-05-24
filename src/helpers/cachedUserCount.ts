import { ChatModel } from '@/models/Chat'

const TTL_MS = 5 * 60 * 1000
let cache = { count: 0, at: 0 }

/** Fast user count for /start (avoids heavy aggregate stats). */
export async function getCachedUserCount(): Promise<number> {
  const now = Date.now()
  if (cache.at > 0 && now - cache.at < TTL_MS) {
    return cache.count
  }
  cache = {
    count: await ChatModel.countDocuments(),
    at: now,
  }
  return cache.count
}

export function bumpCachedUserCount(): void {
  if (cache.at > 0) {
    cache.count += 1
  }
}
