import { InlineKeyboard } from 'grammy'
import env from '@/helpers/env'
import { DownloadMode } from '@/models/DownloadMode'
import Context from '@/models/Context'

const VIDEO_HEIGHTS = [1080, 720, 480, 360] as const

export function buildFormatKeyboard(ctx: Context): InlineKeyboard {
  const kb = new InlineKeyboard()
  const heights = VIDEO_HEIGHTS.filter((h) => h <= env.YOUTUBE_MAX_HEIGHT)

  for (const h of heights) {
    kb.text(ctx.i18n.t('btn_format_video', { height: String(h) }), `fmt:v:${h}`)
  }
  kb.row()
  kb.text(ctx.i18n.t('btn_format_audio'), 'fmt:a')
  kb.text(ctx.i18n.t('btn_format_image'), 'fmt:i')
  kb.row()
  kb.text(ctx.i18n.t('btn_share_bot'), 'action:share')
  return kb
}

export function parseFormatCallback(
  data: string
): { mode: DownloadMode; maxHeight: number } | undefined {
  if (data === 'fmt:a') {
    return { mode: DownloadMode.audio, maxHeight: 0 }
  }
  if (data === 'fmt:i') {
    return { mode: DownloadMode.image, maxHeight: 0 }
  }
  const video = /^fmt:v:(\d+)$/.exec(data)
  if (video) {
    return {
      mode: DownloadMode.video,
      maxHeight: Number(video[1]) || 720,
    }
  }
  return undefined
}
