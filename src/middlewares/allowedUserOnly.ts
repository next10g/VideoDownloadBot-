import { NextFunction } from 'grammy'
import env from '@/helpers/env'
import Context from '@/models/Context'

export function isAllowedUser(userId: number | undefined): boolean {
  if (userId === undefined) {
    return false
  }
  return userId === env.ADMIN_ID
}

export default async function allowedUserOnly(
  ctx: Context,
  next: NextFunction
) {
  if (!ctx.from) {
    return
  }
  if (isAllowedUser(ctx.from.id)) {
    return next()
  }
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: '🔒 Private bot',
      show_alert: true,
    })
    return
  }
  await ctx.reply(ctx.i18n.t('error_private_bot'), { parse_mode: 'HTML' })
}
