import bot from '@/helpers/bot'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Commands visible to everyone (BotFather menu / slash list). */
const PUBLIC_COMMANDS = [
  { command: 'start', description: 'القائمة الرئيسية' },
  { command: 'auto', description: 'وضع ذكي (افتراضي)' },
  { command: 'video', description: 'فيديو + جودات' },
  { command: 'audio', description: 'صوت فقط' },
  { command: 'image', description: 'صورة فقط' },
  { command: 'help', description: 'المساعدة' },
  { command: 'language', description: 'اللغة' },
  { command: 'refer', description: 'دعوة الأصدقاء' },
  { command: 'mylinks', description: 'روابطك المحفوظة' },
  { command: 'statsme', description: 'إحصائياتك' },
  { command: 'sticker', description: 'صورة → ستيكر' },
  { command: 'zip', description: 'ضغط صور ZIP' },
] as const

/** Admin-only — registered for your chat id only (hidden from other users). */
const ADMIN_COMMANDS = [
  { command: 'admin', description: 'لوحة الأدمن' },
  { command: 'stats', description: 'إحصائيات البوت' },
  { command: 'users', description: 'قائمة المستخدمين' },
] as const

export async function syncBotCommands(): Promise<void> {
  try {
    await bot.api.setMyCommands([...PUBLIC_COMMANDS])
    await bot.api.setMyCommands([...ADMIN_COMMANDS], {
      scope: { type: 'chat', chat_id: env.ADMIN_ID },
    })
    logger.info('bot commands synced', { adminId: env.ADMIN_ID })
  } catch (error) {
    logger.warn('bot commands sync failed', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
