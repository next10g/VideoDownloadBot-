import { findUrl, type UrlCacheKey } from '@/models/Url'
import { DownloadMode } from '@/models/DownloadMode'
import Context from '@/models/Context'
import MessageEditor from '@/helpers/MessageEditor'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import logger from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import { recordDownloadSuccess } from '@/helpers/userAbuse'

export default async function checkForCachedUrlAndSendFile(
  key: UrlCacheKey,
  ctx: Context,
  editor: MessageEditor
): Promise<boolean> {
  const mode = key.downloadMode ?? DownloadMode.video
  if (mode === DownloadMode.album) {
    return false
  }

  const cachedUrl = await findUrl(key)
  if (!cachedUrl) {
    return false
  }

  metrics.increment('cacheHits')
  logger.info('cache hit', { url: key.url, chatId: ctx.dbchat.telegramId })

  await editor.editMessage(ctx.i18n.t('status_sending_cached'))
  if (!ctx.msg) {
    return false
  }

  await sendCompletedFile(
    ctx.dbchat.telegramId,
    ctx.msg.message_id,
    ctx.dbchat.language,
    {
      audio: key.audio,
      downloadMode: mode,
    },
    cachedUrl.title,
    cachedUrl.fileId
  )

  await editor.editMessage(ctx.i18n.t('status_completed'))
  recordDownloadSuccess(ctx.dbchat.telegramId)
  return true
}
