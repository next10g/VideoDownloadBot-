import { InlineKeyboard } from 'grammy'
import { DownloadMode } from '@/models/DownloadMode'
import type { StoredMediaProbe } from '@/helpers/pendingMediaProbe'
import Context from '@/models/Context'

export function buildFormatKeyboardFromProbe(
  ctx: Context,
  probe: StoredMediaProbe
): InlineKeyboard {
  const kb = new InlineKeyboard()
  const heights = probe.videoHeights.filter((h) => h > 0)

  if (heights.length > 0) {
    for (const h of heights) {
      kb.text(ctx.i18n.t('btn_format_video', { height: String(h) }), `fmt:v:${h}`)
    }
    kb.row()
    if (probe.hasAudio) {
      kb.text(ctx.i18n.t('btn_format_audio'), 'fmt:a')
    }
  }

  if (probe.hasImage) {
    if (heights.length === 0) {
      kb.text(ctx.i18n.t('btn_format_image'), 'fmt:i')
    } else {
      kb.text(ctx.i18n.t('btn_format_image'), 'fmt:i')
    }
  }

  if (heights.length === 0 && !probe.hasImage) {
    kb.text(ctx.i18n.t('btn_format_video', { height: '720' }), 'fmt:v:720')
    kb.row()
    kb.text(ctx.i18n.t('btn_format_audio'), 'fmt:a')
  }

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
