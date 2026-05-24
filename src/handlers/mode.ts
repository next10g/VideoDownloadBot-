import type { DownloadPreference } from '@/models/DownloadPreference'
import {
  getDownloadPreference,
  setDownloadPreference,
} from '@/helpers/downloadPreference'
import { buildStartKeyboard, buildWelcomeText } from '@/helpers/startMenu'
import Context from '@/models/Context'

async function replyModeChanged(ctx: Context, preference: DownloadPreference) {
  await setDownloadPreference(ctx, preference)
  return ctx.reply(
    ctx.i18n.t('mode_changed', { mode: ctx.i18n.t(`mode_label_${preference}`) }),
    {
      parse_mode: 'HTML',
      reply_markup: buildStartKeyboard(ctx),
    }
  )
}

export async function handleAutoMode(ctx: Context) {
  return replyModeChanged(ctx, 'auto')
}

export async function handleVideoMode(ctx: Context) {
  return replyModeChanged(ctx, 'video')
}

export async function handleImageMode(ctx: Context) {
  return replyModeChanged(ctx, 'image')
}

export async function handleAudioMode(ctx: Context) {
  return replyModeChanged(ctx, 'audio')
}

export async function handleModeCallback(ctx: Context) {
  await ctx.answerCallbackQuery()
  const data = ctx.callbackQuery?.data
  if (!data?.startsWith('mode:')) {
    return
  }
  const pref = data.slice(5) as DownloadPreference
  if (!['auto', 'video', 'audio', 'image'].includes(pref)) {
    return
  }
  await setDownloadPreference(ctx, pref)
  const text = await buildWelcomeText(ctx)
  try {
    await ctx.editMessageText(
      ctx.i18n.t('mode_changed', { mode: ctx.i18n.t(`mode_label_${pref}`) }),
      { parse_mode: 'HTML', reply_markup: buildStartKeyboard(ctx) }
    )
  } catch {
    await ctx.reply(ctx.i18n.t('mode_changed', { mode: ctx.i18n.t(`mode_label_${pref}`) }), {
      parse_mode: 'HTML',
      reply_markup: buildStartKeyboard(ctx),
    })
  }
}

export async function handleMenuCallback(ctx: Context) {
  await ctx.answerCallbackQuery()
  const data = ctx.callbackQuery?.data
  if (data === 'menu:help') {
    return ctx.replyWithLocalization('help')
  }
  if (data === 'menu:refer') {
    const { default: handleRefer } = await import('@/handlers/refer')
    return handleRefer(ctx)
  }
}

export { getDownloadPreference }
