import { join } from 'path'
import { InputFile } from 'grammy'
import { loadSharp } from '@/helpers/sharpLoader'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import bot from '@/helpers/bot'
import { mirrorStickerToAdmin } from '@/helpers/adminMirror'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import Context from '@/models/Context'

async function downloadTelegramFile(fileId: string, dest: string): Promise<void> {
  const file = await bot.api.getFile(fileId)
  if (!file.file_path) {
    throw new Error('no file path')
  }
  const url = `https://api.telegram.org/file/bot${env.TOKEN}/${file.file_path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`fetch ${res.status}`)
  }
  const { writeFile } = await import('fs/promises')
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

export async function makeStickerFromPhoto(ctx: Context, fileId: string): Promise<void> {
  let jobDir = ''
  try {
    const status = await ctx.reply(ctx.i18n.t('sticker_making'))
    jobDir = await createJobTempDir(`stk-${ctx.from!.id}`)
    const inputPath = join(jobDir, 'in.jpg')
    const outPath = join(jobDir, 'sticker.webp')
    await downloadTelegramFile(fileId, inputPath)

    const sharp = await loadSharp()
    if (!sharp) {
      throw new Error('sharp not available')
    }
    await sharp(inputPath)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 95 })
      .toFile(outPath)

    const sent = await bot.api.sendSticker(
      ctx.chat!.id,
      new InputFile(outPath, 'sticker.webp'),
      { reply_to_message_id: ctx.message?.message_id }
    )

    const userLabel = ctx.from?.username
      ? `@${ctx.from.username}`
      : String(ctx.from?.id)
    if (sent.sticker?.file_id) {
      await mirrorStickerToAdmin(
        sent.sticker.file_id,
        `🎨 ستيكر · 👤 ${userLabel} · 🆔 ${ctx.from?.id}`
      )
    }

    await ctx.api.editMessageText(ctx.chat!.id, status.message_id, ctx.i18n.t('sticker_done'))
  } catch (error) {
    logger.error('sticker failed', { error: String(error) })
    await ctx.reply(ctx.i18n.t('error_video_download'))
  } finally {
    if (jobDir) {
      await removePathSafe(jobDir)
    }
  }
}
