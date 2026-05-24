import Context from '@/models/Context'
import { logSubmittedLink } from '@/helpers/logUserLink'
import { collectPhotoForZip } from '@/helpers/zipBatch'
import sendCompletedFile from '@/helpers/sendCompletedFile'
import { DownloadMode } from '@/models/DownloadMode'
import report from '@/helpers/report'
import { recordDownloadSuccess } from '@/helpers/userAbuse'

/** Re-send Telegram photos with caption (no external URL). Album → ZIP. */
export default async function handlePhoto(ctx: Context) {
  const photos = ctx.message?.photo
  if (!photos?.length || !ctx.from) {
    return
  }

  if (ctx.message?.media_group_id) {
    return collectPhotoForZip(ctx)
  }
  const largest = photos[photos.length - 1]
  const caption = ctx.message?.caption?.trim() || ''

  try {
    await logSubmittedLink(ctx, `telegram:photo:${largest.file_id}`, {
      downloadMode: DownloadMode.image,
      title: caption.slice(0, 200),
    })

    const status = await ctx.reply(ctx.i18n.t('status_sending_cached'))
    await sendCompletedFile(
      ctx.dbchat.telegramId,
      status.message_id,
      ctx.dbchat.language,
      { audio: false, downloadMode: DownloadMode.image },
      caption || ctx.i18n.t('photo_default_title'),
      largest.file_id
    )
    await ctx.api.editMessageText(
      ctx.chat!.id,
      status.message_id,
      ctx.i18n.t('status_completed')
    )
    recordDownloadSuccess(ctx.dbchat.telegramId)
  } catch (error) {
    report(error, { ctx, location: 'handlePhoto' })
    return ctx.reply(ctx.i18n.t('error_video_download'))
  }
}
