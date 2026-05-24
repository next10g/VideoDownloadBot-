import Context from '@/models/Context'
import bot from '@/helpers/bot'
import env from '@/helpers/env'

export default async function handleRefer(ctx: Context) {
  if (!env.REFERRAL_ENABLED || !ctx.dbchat.referralCode) {
    return ctx.reply(ctx.i18n.t('refer_disabled'))
  }
  const link = `https://t.me/${bot.botInfo.username}?start=ref_${ctx.dbchat.referralCode}`
  const count = ctx.dbchat.referralCount || 0
  return ctx.reply(
    ctx.i18n.t('refer_info', {
      link,
      count: String(count),
      bot: bot.botInfo.username,
    }),
    { parse_mode: 'HTML' }
  )
}
