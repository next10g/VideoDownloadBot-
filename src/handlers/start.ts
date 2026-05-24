import { InlineKeyboard } from 'grammy'
import Context from '@/models/Context'
import { applyReferralFromStart } from '@/helpers/syncChatProfile'
import bot from '@/helpers/bot'
import env from '@/helpers/env'

export default async function handleStart(ctx: Context) {
  const payload =
    typeof ctx.match === 'string'
      ? ctx.match
      : Array.isArray(ctx.match)
        ? ctx.match[0]
        : undefined

  await applyReferralFromStart(ctx, payload)

  const kb = new InlineKeyboard()
  if (env.REFERRAL_ENABLED && ctx.dbchat.referralCode) {
    kb.url(
      ctx.i18n.t('btn_invite_friend'),
      `https://t.me/share/url?url=${encodeURIComponent(
        `https://t.me/${bot.botInfo.username}?start=ref_${ctx.dbchat.referralCode}`
      )}&text=${encodeURIComponent(ctx.i18n.t('refer_share_text'))}`
    )
    kb.row()
  }
  kb.text(ctx.i18n.t('btn_language_menu'), 'noop:language')

  const text = ctx.i18n.t('welcome')
  return ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' })
}
