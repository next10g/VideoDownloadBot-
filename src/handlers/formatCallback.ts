import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { parseFormatCallback } from '@/helpers/formatKeyboard'
import { loadProbe } from '@/helpers/pendingMediaProbe'
import { DownloadMode } from '@/models/DownloadMode'
import { pickFacebookStream } from '@/services/facebookEmbed'
import Context from '@/models/Context'
import report from '@/helpers/report'
import bot from '@/helpers/bot'
import env from '@/helpers/env'

function resolveDirectStream(
  parsed: { mode: DownloadMode; maxHeight: number },
  probe: ReturnType<typeof loadProbe>
): string | undefined {
  if (!probe?.facebook) {
    return undefined
  }
  if (parsed.mode === DownloadMode.image && probe.facebook.imageUrl) {
    return probe.facebook.imageUrl
  }
  if (parsed.mode === DownloadMode.video || parsed.mode === DownloadMode.audio) {
    const stream = pickFacebookStream(probe.facebook, parsed.maxHeight || 720)
    return stream?.url
  }
  return undefined
}

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

  const probe = loadProbe(ctx.dbchat.pendingMediaProbe)
  const directStreamUrl = resolveDirectStream(parsed, probe)
  const jobUrl = probe?.downloadUrl || probe?.facebook?.resolvedUrl || url

  try {
    return createDownloadJobAndRequest(ctx, jobUrl, {
      downloadMode: parsed.mode,
      maxHeight: parsed.maxHeight,
      preferredExt: parsed.preferredExt,
      audio: parsed.mode === DownloadMode.audio,
      directStreamUrl,
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
