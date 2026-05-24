import { collectPhotoForZip } from '@/helpers/zipBatch'
import Context from '@/models/Context'

/** /zip then send up to 10 photos (or send album). */
export default async function handleZipCommand(ctx: Context) {
  return ctx.reply(ctx.i18n.t('zip_hint'))
}

export async function handleZipPhoto(ctx: Context) {
  if (ctx.message?.media_group_id || ctx.message?.photo) {
    return collectPhotoForZip(ctx)
  }
}
