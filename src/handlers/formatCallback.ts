import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { parseFormatCallback } from '@/helpers/formatKeyboard'
import { DownloadMode } from '@/models/DownloadMode'
import Context from '@/models/Context'
import report from '@/helpers/report'
import bot from '@/helpers/bot'
import env from '@/helpers/env'

export async function handleFormatChoice(ctx: Context) {
  await ctx.answerCallbackQuery()
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('fmt:')) {
    return
  }

  const parsed = parseFormatCallback(data)
  if (!parsed) {
    return
  }

  const url = ctx.dbchat.pendingUrl
  if (!url) {
    return ctx.reply(ctx.i18n.t('error_retry_no_url'))
  }

  try {
    return createDownloadJobAndRequest(ctx, url, {
      downloadMode: parsed.mode,
      maxHeight: parsed.maxHeight,
      audio: parsed.mode === DownloadMode.audio,
    })
  } catch (error) {
    report(error, { ctx, location: 'handleFormatChoice' })
    return ctx.reply(ctx.i18n.t('error_cannot_start_download'))
  }
}

export async function handleShareBot(ctx: Context) {
  await ctx.answerCallbackQuery()
  if (!env.REFERRAL_ENABLED || !ctx.dbchat.referralCode) {
    return
  }
  const link = `https://t.me/${bot.botInfo.username}?start=ref_${ctx.dbchat.referralCode}`
  return ctx.reply(
    ctx.i18n.t('refer_share', {
      link,
      bot: bot.botInfo.username,
    }),
    { parse_mode: 'HTML' }
  )
}
