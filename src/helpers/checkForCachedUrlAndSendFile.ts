import { findUrl } from '@/models/Url'
import Context from '@/models/Context'
import MessageEditor from '@/helpers/MessageEditor'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import logger from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { recordDownloadSuccess } from '@/helpers/userAbuse'

export default async function checkForCachedUrlAndSendFile(
  url: string,
  ctx: Context,
  editor: MessageEditor
): Promise<boolean> {
  const cachedUrl = await findUrl(url, ctx.dbchat.audio)
  if (!cachedUrl) {
    return false
  }

  metrics.increment('cacheHits')
  logger.info('cache hit', { url, chatId: ctx.dbchat.telegramId })

  await editor.editMessage(ctx.i18n.t('status_sending_cached'))
  if (!ctx.msg) {
    return false
  }

  await sendCompletedFile(
    ctx.dbchat.telegramId,
    ctx.msg.message_id,
    ctx.dbchat.language,
    ctx.dbchat.audio,
    cachedUrl.title,
    cachedUrl.fileId
  )

  await editor.editMessage(ctx.i18n.t('status_completed'))
  recordDownloadSuccess(ctx.dbchat.telegramId)
  return true
}
