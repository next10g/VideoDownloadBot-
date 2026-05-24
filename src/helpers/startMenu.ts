import { InlineKeyboard } from 'grammy'
import type { DownloadPreference } from '@/models/DownloadPreference'
import { getDownloadPreference, modeLabelKey } from '@/helpers/downloadPreference'
import { getCachedUserCount } from '@/helpers/cachedUserCount'
import Context from '@/models/Context'
import bot from '@/helpers/bot'
import env from '@/helpers/env'
import { isBotAdmin } from '@/helpers/isBotAdmin'

export async function buildWelcomeText(ctx: Context): Promise<string> {
  const pref = getDownloadPreference(ctx.dbchat)
  let userCount = '—'
  try {
    userCount = String(await getCachedUserCount())
  } catch {
    // optional
  }
  return ctx.i18n.t('welcome_menu', {
    bot: bot.botInfo.username,
    mode: ctx.i18n.t(modeLabelKey(pref)),
    users: userCount,
  })
}

export function buildStartKeyboard(ctx: Context): InlineKeyboard {
  const pref = getDownloadPreference(ctx.dbchat)
  const kb = new InlineKeyboard()

  const mark = (p: DownloadPreference) => (pref === p ? ' ✓' : '')

  kb.text(`🤖 ${ctx.i18n.t('mode_label_auto')}${mark('auto')}`, 'mode:auto')
  kb.text(`🎬 ${ctx.i18n.t('mode_label_video')}${mark('video')}`, 'mode:video')
  kb.row()
  kb.text(`🎵 ${ctx.i18n.t('mode_label_audio')}${mark('audio')}`, 'mode:audio')
  kb.text(`🖼 ${ctx.i18n.t('mode_label_image')}${mark('image')}`, 'mode:image')
  kb.row()
  kb.text(`📸 ${ctx.i18n.t('mode_label_carousel')}${mark('carousel')}`, 'mode:carousel')
  kb.row()
  kb.text(ctx.i18n.t('btn_menu_help'), 'menu:help')
  kb.text(ctx.i18n.t('btn_language_menu'), 'noop:language')
  kb.row()

  if (env.REFERRAL_ENABLED && ctx.dbchat.referralCode) {
    kb.text(ctx.i18n.t('btn_invite_friend'), 'menu:refer')
  }

  if (isBotAdmin(ctx)) {
    kb.row()
    kb.text(ctx.i18n.t('btn_admin_panel'), 'admin:panel')
  }

  return kb
}
