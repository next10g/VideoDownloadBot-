import { makeStickerFromPhoto } from '@/helpers/stickerMaker'
import Context from '@/models/Context'

export default async function handleSticker(ctx: Context) {
  const reply = ctx.message?.reply_to_message
  const photos = reply?.photo ?? ctx.message?.photo
  if (!photos?.length) {
    return ctx.reply(ctx.i18n.t('sticker_need_photo'))
  }
  const largest = photos[photos.length - 1]
  return makeStickerFromPhoto(ctx, largest.file_id)
}
