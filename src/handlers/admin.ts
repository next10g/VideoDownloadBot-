import { InlineKeyboard } from 'grammy'
import bot from '@/helpers/bot'
import {
  adminUserLinksKeyboard,
  fetchProfilePhotoFileId,
  formatAdminUserHeader,
  formatAdminUserLinks,
} from '@/helpers/adminUserDetail'
import {
  formatAdminLinksPage,
  formatAdminPanel,
  formatAdminUsersPage,
} from '@/helpers/adminPanel'
import { isBotAdmin } from '@/helpers/isBotAdmin'
import {
  safeAnswerCallback,
  safeEditMessageText,
} from '@/helpers/telegramErrors'
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
    const { text, keyboard } = await formatAdminUsersPage(0)
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard })
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

async function showAdminUser(ctx: Context, telegramId: number, linkPage = 0) {
  const header = await formatAdminUserHeader(telegramId)
  const links = await formatAdminUserLinks(telegramId, linkPage)
  const text = `${header}\n\n${links}`
  const kb = adminUserLinksKeyboard(telegramId, linkPage)

  const photoId = await fetchProfilePhotoFileId(telegramId)
  if (photoId && ctx.callbackQuery) {
    try {
      await ctx.deleteMessage()
    } catch {
      // ignore
    }
    await bot.api.sendPhoto(ctx.chat!.id, photoId, {
      caption: text.slice(0, 1024),
      reply_markup: kb,
    })
    return
  }

  if (ctx.callbackQuery?.message) {
    await safeEditMessageText(ctx, text, { reply_markup: kb })
  } else {
    await ctx.reply(text, { reply_markup: kb })
  }
}

export async function handleAdminCallback(ctx: Context) {
  if (!isBotAdmin(ctx)) {
    await safeAnswerCallback(ctx)
    return
  }
  await safeAnswerCallback(ctx)

  const data = ctx.callbackQuery?.data || ''
  try {
    if (data === 'admin:panel') {
      return handleAdminPanel(ctx)
    }
    if (data === 'admin:stats') {
      await safeEditMessageText(ctx, await formatAdminPanel(), {
        parse_mode: 'HTML',
      })
      return
    }

    const usersMatch = /^admin:users:(-?\d+)$/.exec(data)
    if (usersMatch) {
      const page = Math.max(0, Number(usersMatch[1]) || 0)
      const { text, keyboard } = await formatAdminUsersPage(page)
      await safeEditMessageText(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      return
    }

    const userMatch = /^admin:user:(\d+):(-?\d+)$/.exec(data)
    if (userMatch) {
      const uid = Number(userMatch[1])
      const linkPage = Math.max(0, Number(userMatch[2]) || 0)
      return showAdminUser(ctx, uid, linkPage)
    }

    const ulinkMatch = /^admin:ulink:(\d+):(-?\d+)$/.exec(data)
    if (ulinkMatch) {
      const uid = Number(ulinkMatch[1])
      const linkPage = Math.max(0, Number(ulinkMatch[2]) || 0)
      return showAdminUser(ctx, uid, linkPage)
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
      await safeEditMessageText(ctx, await formatAdminLinksPage(page), {
        parse_mode: 'HTML',
        reply_markup: kb,
      })
    }
  } catch (error) {
    report(error, { ctx, location: 'handleAdminCallback' })
  }
}
