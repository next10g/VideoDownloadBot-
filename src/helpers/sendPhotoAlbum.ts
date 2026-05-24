import { InputFile } from 'grammy'
import bot from '@/helpers/bot'
import logger from '@/lib/logger'

const TELEGRAM_ALBUM_MAX = 10

/** Send photos as Telegram album(s) — never as ZIP document. */
export async function sendPhotoAlbum(
  chatId: number,
  replyToMessageId: number | undefined,
  paths: string[]
): Promise<string[]> {
  const fileIds: string[] = []
  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += TELEGRAM_ALBUM_MAX) {
    chunks.push(paths.slice(i, i + TELEGRAM_ALBUM_MAX))
  }

  for (const chunk of chunks) {
    const media = chunk.map((path, index) => ({
      type: 'photo' as const,
      media: new InputFile(path, `photo_${index + 1}.jpg`),
    }))
    const sent = await bot.api.sendMediaGroup(chatId, media, {
      reply_to_message_id: replyToMessageId,
    })
    for (const msg of sent) {
      if (msg.photo?.length) {
        fileIds.push(msg.photo[msg.photo.length - 1].file_id)
      }
    }
    logger.info('photo album sent', { chatId, count: chunk.length })
  }

  return fileIds
}
