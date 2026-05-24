import env from '@/helpers/env'
import type Context from '@/models/Context'

/** Strict match — only env.ADMIN_ID (your Telegram numeric id). */
export function isBotAdminId(userId?: number | string | null): boolean {
  if (userId == null || userId === '') {
    return false
  }
  const admin = Number(env.ADMIN_ID)
  const uid = Number(userId)
  if (!Number.isFinite(admin) || !Number.isFinite(uid) || admin <= 0) {
    return false
  }
  return uid === admin
}

export function isBotAdmin(ctx: Pick<Context, 'from'>): boolean {
  return isBotAdminId(ctx.from?.id)
}
