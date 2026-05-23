import env from '@/helpers/env'

const lastRequestByChat = new Map<number, number>()

export function isOnCooldown(chatId: number): boolean {
  const last = lastRequestByChat.get(chatId)
  if (!last) {
    return false
  }
  return Date.now() - last < env.USER_COOLDOWN_MS
}

export function cooldownRemainingSeconds(chatId: number): number {
  const last = lastRequestByChat.get(chatId)
  if (!last) {
    return 0
  }
  const remaining = env.USER_COOLDOWN_MS - (Date.now() - last)
  return Math.max(0, Math.ceil(remaining / 1000))
}

export function touchCooldown(chatId: number): void {
  lastRequestByChat.set(chatId, Date.now())
  // Prevent unbounded Map growth on long-running processes.
  if (lastRequestByChat.size > 10_000) {
    const cutoff = Date.now() - env.USER_COOLDOWN_MS * 2
    for (const [id, ts] of lastRequestByChat) {
      if (ts < cutoff) {
        lastRequestByChat.delete(id)
      }
    }
  }
}
