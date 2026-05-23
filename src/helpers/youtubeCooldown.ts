import env from '@/helpers/env'

const lastYoutubeByChat = new Map<number, number>()

export function isOnYoutubeCooldown(chatId: number): boolean {
  if (env.YOUTUBE_USER_COOLDOWN_SECONDS <= 0) {
    return false
  }
  const last = lastYoutubeByChat.get(chatId)
  if (!last) {
    return false
  }
  return Date.now() - last < env.YOUTUBE_USER_COOLDOWN_MS
}

export function youtubeCooldownRemainingSeconds(chatId: number): number {
  const last = lastYoutubeByChat.get(chatId)
  if (!last) {
    return 0
  }
  const remaining = env.YOUTUBE_USER_COOLDOWN_MS - (Date.now() - last)
  return Math.max(0, Math.ceil(remaining / 1000))
}

export function touchYoutubeCooldown(chatId: number): void {
  if (env.YOUTUBE_USER_COOLDOWN_SECONDS <= 0) {
    return
  }
  lastYoutubeByChat.set(chatId, Date.now())
  if (lastYoutubeByChat.size > 10_000) {
    const cutoff = Date.now() - env.YOUTUBE_USER_COOLDOWN_MS * 2
    for (const [id, ts] of lastYoutubeByChat) {
      if (ts < cutoff) {
        lastYoutubeByChat.delete(id)
      }
    }
  }
}
