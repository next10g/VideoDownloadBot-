import env from '@/helpers/env'
import { collectBotStats, formatBotStats } from '@/helpers/botStats'
import Context from '@/models/Context'
import report from '@/helpers/report'

function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === env.ADMIN_ID
}

export async function handleAdminStats(ctx: Context) {
  if (!isAdmin(ctx)) {
    return ctx.reply(ctx.i18n.t('error_private_bot'))
  }
  try {
    const stats = await collectBotStats()
    return ctx.reply(formatBotStats(stats), { parse_mode: 'HTML' })
  } catch (error) {
    report(error, { ctx, location: 'handleAdminStats' })
    return ctx.reply(ctx.i18n.t('error_cannot_start_download'))
  }
}

export async function handleAdminUsers(ctx: Context) {
  return handleAdminStats(ctx)
}
