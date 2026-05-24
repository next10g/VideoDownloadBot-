import { generateReferralCode } from '@/models/Chat'
import Context from '@/models/Context'

export async function syncChatProfile(ctx: Context): Promise<void> {
  const from = ctx.from
  if (!from) {
    return
  }
  let changed = false
  if (from.username && ctx.dbchat.username !== from.username) {
    ctx.dbchat.username = from.username
    changed = true
  }
  if (from.first_name && ctx.dbchat.firstName !== from.first_name) {
    ctx.dbchat.firstName = from.first_name
    changed = true
  }
  if (from.last_name && ctx.dbchat.lastName !== from.last_name) {
    ctx.dbchat.lastName = from.last_name
    changed = true
  }
  if (!ctx.dbchat.referralCode) {
    ctx.dbchat.referralCode = generateReferralCode()
    changed = true
  }
  if (changed) {
    await ctx.dbchat.save()
  }
}

export async function applyReferralFromStart(
  ctx: Context,
  payload: string | undefined
): Promise<void> {
  if (!payload?.startsWith('ref_') || !ctx.from) {
    return
  }
  const code = payload.slice(4).toLowerCase()
  if (!code || ctx.dbchat.referredBy) {
    return
  }
  const { ChatModel } = await import('@/models/Chat')
  const referrer = await ChatModel.findOne({ referralCode: code })
  if (!referrer || referrer.telegramId === ctx.from.id) {
    return
  }
  ctx.dbchat.referredBy = referrer.telegramId
  referrer.referralCount = (referrer.referralCount || 0) + 1
  await referrer.save()
  await ctx.dbchat.save()
}
