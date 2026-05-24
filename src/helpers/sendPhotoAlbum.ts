import { InputFile } from 'grammy'
import type { Message } from '@grammyjs/types'
import bot from '@/helpers/bot'
import { prepareTelegramPhoto } from '@/helpers/prepareTelegramPhoto'
import logger from '@/lib/logger'

function isPhotoMessage(msg: Message): msg is Message.PhotoMessage {
  return msg.photo !== undefined
}

const TELEGRAM_ALBUM_MAX = 10

async function sendOnePhoto(
  chatId: number,
  path: string,
  replyToMessageId?: number
): Promise<string | undefined> {
  const ready = await prepareTelegramPhoto(path)
  const sent = await bot.api.sendPhoto(chatId, new InputFile(ready, 'photo.jpg'), {
    reply_to_message_id: replyToMessageId,
  })
  if (sent.photo?.length) {
    return sent.photo[sent.photo.length - 1].file_id
  }
  return undefined
}

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

  let globalIndex = 0
  for (const chunk of chunks) {
    const prepared: string[] = []
    for (const path of chunk) {
      try {
        prepared.push(await prepareTelegramPhoto(path))
      } catch (error) {
        logger.warn('photo prepare skip', {
          index: globalIndex,
          detail: error instanceof Error ? error.message : String(error),
        })
      }
      globalIndex++
    }
    if (prepared.length === 0) {
      continue
    }

    try {
      const media = prepared.map((path, index) => ({
        type: 'photo' as const,
        media: new InputFile(path, `photo_${index + 1}.jpg`),
      }))
      const sent = await bot.api.sendMediaGroup(chatId, media, {
        reply_to_message_id: replyToMessageId,
      })
      for (const msg of sent) {
        if (isPhotoMessage(msg) && msg.photo.length) {
          fileIds.push(msg.photo[msg.photo.length - 1].file_id)
        }
      }
      logger.info('photo album sent', { chatId, count: prepared.length })
    } catch (error) {
      logger.warn('sendMediaGroup failed, sending photos individually', {
        chatId,
        detail: error instanceof Error ? error.message : String(error),
      })
      let firstInChunk = true
      for (const path of prepared) {
        try {
          const fileId = await sendOnePhoto(
            chatId,
            path,
            firstInChunk ? replyToMessageId : undefined
          )
          firstInChunk = false
          if (fileId) {
            fileIds.push(fileId)
          }
        } catch (oneError) {
          logger.warn('single photo send skip', {
            detail:
              oneError instanceof Error ? oneError.message : String(oneError),
          })
        }
      }
    }
  }

  if (fileIds.length === 0) {
    throw new Error('No photos could be sent to Telegram')
  }

  return fileIds
}
