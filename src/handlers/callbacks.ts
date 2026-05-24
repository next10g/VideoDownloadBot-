import Context from '@/models/Context'
import createDownloadJobAndRequest from '@/helpers/createDownloadJobAndRequest'
import { DownloadMode } from '@/models/DownloadMode'
import { isUserSubscribed } from '@/middlewares/requiredSubscription'
import {
  blockRemainingMinutes,
  isUserBlocked,
  registerRetryAttempt,
} from '@/helpers/userAbuse'
import report from '@/helpers/report'

export async function handleRetrySubscription(ctx: Context) {
  await ctx.answerCallbackQuery()
  if (!ctx.from) {
    return
  }
  const subscribed = await isUserSubscribed(ctx, ctx.from.id)
  if (subscribed) {
    await ctx.reply(ctx.i18n.t('subscription_confirmed'))
    if (ctx.dbchat.lastUrl) {
      return createDownloadJobAndRequest(ctx, ctx.dbchat.lastUrl, {
        downloadMode: ctx.dbchat.audio ? DownloadMode.audio : DownloadMode.video,
        maxHeight: 720,
        audio: ctx.dbchat.audio,
      })
    }
    return
  }
  await ctx.answerCallbackQuery({
    text: ctx.i18n.t('subscription_required_short'),
    show_alert: true,
  })
}

export async function handleRetryDownload(ctx: Context) {
  await ctx.answerCallbackQuery()
  if (!ctx.from || !ctx.dbchat) {
    return
  }
  if (isUserBlocked(ctx.dbchat.telegramId)) {
    return ctx.reply(
      ctx.i18n.t('error_user_blocked', {
        minutes: String(blockRemainingMinutes(ctx.dbchat.telegramId)),
      })
    )
  }
  if (registerRetryAttempt(ctx.dbchat.telegramId)) {
    return ctx.reply(ctx.i18n.t('error_retry_spam'))
  }
  if (!ctx.dbchat.lastUrl) {
    return ctx.reply(ctx.i18n.t('error_retry_no_url'))
  }
  if (!(await isUserSubscribed(ctx, ctx.from.id))) {
    return ctx.reply(ctx.i18n.t('subscription_required_short'))
  }
  try {
    return createDownloadJobAndRequest(ctx, ctx.dbchat.lastUrl, {
      downloadMode: ctx.dbchat.audio ? DownloadMode.audio : DownloadMode.video,
      maxHeight: 720,
      audio: ctx.dbchat.audio,
    })
  } catch (error) {
    report(error, { ctx, location: 'handleRetryDownload' })
    return ctx.reply(ctx.i18n.t('error_cannot_start_download'))
  }
}
