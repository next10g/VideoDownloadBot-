import bot from '@/helpers/bot'
import { getCachedUserCount } from '@/helpers/cachedUserCount'
import logger from '@/lib/logger'

/** Show user count in bot short description (visible in chat list). */
export async function syncBotProfileUserCount(): Promise<void> {
  try {
    const users = await getCachedUserCount()
    const short = `👥 ${users} مستخدم · Easy Way — حمّل فيديو وصورة وصوت`
    await bot.api.setMyShortDescription(short)
    logger.info('bot profile synced', { users })
  } catch (error) {
    logger.warn('bot profile sync failed', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
