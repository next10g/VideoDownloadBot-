import { InlineKeyboard } from 'grammy'
import {
  formatAdminLinksPage,
  formatAdminPanel,
  formatAdminUsersPage,
} from '@/helpers/adminPanel'
import { isBotAdmin } from '@/helpers/isBotAdmin'
import Context from '@/models/Context'
import report from '@/helpers/report'

export async function handleAdminStats(ctx: Context) {
  if (!isBotAdmin(ctx)) {
    return
  }
  try {
    return ctx.reply(await formatAdminPanel(), { parse_mode: 'HTML' })
  } catch (error) {
    report(error, { ctx, location: 'handleAdminStats' })
    return ctx.reply(ctx.i18n.t('error_cannot_start_download'))
  }
}

export async function handleAdminUsers(ctx: Context) {
  if (!isBotAdmin(ctx)) {
    return
  }
  try {
    const page = 0
    const kb = new InlineKeyboard()
      .text('◀️', `admin:users:${page - 1}`)
      .text('▶️', `admin:users:${page + 1}`)
      .row()
      .text('🔗 الروابط', 'admin:links:0')
    return ctx.reply(await formatAdminUsersPage(page), {
      parse_mode: 'HTML',
      reply_markup: kb,
    })
  } catch (error) {
    report(error, { ctx, location: 'handleAdminUsers' })
    return ctx.reply(ctx.i18n.t('error_cannot_start_download'))
  }
}

export async function handleAdminPanel(ctx: Context) {
  if (!isBotAdmin(ctx)) {
    return
  }
  const kb = new InlineKeyboard()
    .text('📊 إحصائيات', 'admin:stats')
    .text('👥 مستخدمون', 'admin:users:0')
    .row()
    .text('🔗 الروابط', 'admin:links:0')
  return ctx.reply(ctx.i18n.t('admin_panel_intro'), {
    parse_mode: 'HTML',
    reply_markup: kb,
  })
}

export async function handleAdminCallback(ctx: Context) {
  if (!isBotAdmin(ctx)) {
    await ctx.answerCallbackQuery()
    return
  }
  await ctx.answerCallbackQuery()
  const data = ctx.callbackQuery?.data || ''
  try {
    if (data === 'admin:panel') {
      return handleAdminPanel(ctx)
    }
    if (data === 'admin:stats') {
      await ctx.editMessageText(await formatAdminPanel(), { parse_mode: 'HTML' })
      return
    }
    const usersMatch = /^admin:users:(-?\d+)$/.exec(data)
    if (usersMatch) {
      const page = Math.max(0, Number(usersMatch[1]) || 0)
      const kb = new InlineKeyboard()
        .text('◀️', `admin:users:${page - 1}`)
        .text('▶️', `admin:users:${page + 1}`)
        .row()
        .text('🔗 الروابط', 'admin:links:0')
        .row()
        .text('« لوحة الأدمن', 'admin:panel')
      await ctx.editMessageText(await formatAdminUsersPage(page), {
        parse_mode: 'HTML',
        reply_markup: kb,
      })
      return
    }
    const linksMatch = /^admin:links:(-?\d+)$/.exec(data)
    if (linksMatch) {
      const page = Math.max(0, Number(linksMatch[1]) || 0)
      const kb = new InlineKeyboard()
        .text('◀️', `admin:links:${page - 1}`)
        .text('▶️', `admin:links:${page + 1}`)
        .row()
        .text('👥 مستخدمون', 'admin:users:0')
        .row()
        .text('« لوحة الأدمن', 'admin:panel')
      await ctx.editMessageText(await formatAdminLinksPage(page), {
        parse_mode: 'HTML',
        reply_markup: kb,
      })
    }
  } catch (error) {
    report(error, { ctx, location: 'handleAdminCallback' })
  }
}
