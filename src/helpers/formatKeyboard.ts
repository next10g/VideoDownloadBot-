import { InlineKeyboard } from 'grammy'
import { DownloadMode } from '@/models/DownloadMode'
import type { StoredMediaProbe } from '@/helpers/pendingMediaProbe'
import Context from '@/models/Context'

export interface FormatChoice {
  mode: DownloadMode
  maxHeight: number
  preferredExt?: string
}

export function buildFormatKeyboardFromProbe(
  ctx: Context,
  probe: StoredMediaProbe
): InlineKeyboard {
  const kb = new InlineKeyboard()
  const heights = probe.videoHeights.filter((h) => h > 0)
  const imageSizes = probe.imageSizes.filter((s) => s > 0)
  const audioExts = probe.audioExts.filter(Boolean)

  if (heights.length > 0) {
    for (const h of heights) {
      kb.text(ctx.i18n.t('btn_format_video', { height: String(h) }), `fmt:v:${h}`)
    }
    kb.row()
  }

  if (probe.hasAudio && (heights.length > 0 || audioExts.length > 0)) {
    if (audioExts.length > 1) {
      for (const ext of audioExts.slice(0, 4)) {
        kb.text(
          ctx.i18n.t('btn_format_audio_ext', { ext: ext.toUpperCase() }),
          `fmt:a:${ext}`
        )
      }
    } else {
      kb.text(
        ctx.i18n.t('btn_format_audio'),
        audioExts[0] ? `fmt:a:${audioExts[0]}` : 'fmt:a'
      )
    }
    kb.row()
  }

  if (probe.hasAlbum && probe.albumUrls.length > 1) {
    kb.text(
      ctx.i18n.t('btn_format_album', { count: String(probe.albumUrls.length) }),
      'fmt:alb'
    )
    kb.row()
  }

  if (probe.hasImage) {
    if (imageSizes.length > 1) {
      for (const size of imageSizes.slice(0, 4)) {
        kb.text(
          ctx.i18n.t('btn_format_image_size', { size: String(size) }),
          `fmt:i:${size}`
        )
      }
    } else {
      const single = imageSizes[0]
      kb.text(
        single
          ? ctx.i18n.t('btn_format_image_size', { size: String(single) })
          : ctx.i18n.t('btn_format_image'),
        single ? `fmt:i:${single}` : 'fmt:i'
      )
    }
    kb.row()
  }

  if (probe.isFile) {
    kb.text(ctx.i18n.t('btn_format_file'), 'fmt:f')
    kb.row()
  }

  if (heights.length === 0 && !probe.hasImage && !probe.hasAudio && !probe.isFile) {
    kb.text(ctx.i18n.t('btn_format_video', { height: '720' }), 'fmt:v:720')
    kb.row()
    kb.text(ctx.i18n.t('btn_format_audio'), 'fmt:a')
    kb.row()
  }

  kb.text(ctx.i18n.t('btn_share_bot'), 'action:share')
  return kb
}

export function parseFormatCallback(data: string): FormatChoice | undefined {
  if (data === 'fmt:a') {
    return { mode: DownloadMode.audio, maxHeight: 0 }
  }
  const audioExt = /^fmt:a:([a-z0-9]+)$/.exec(data)
  if (audioExt) {
    return {
      mode: DownloadMode.audio,
      maxHeight: 0,
      preferredExt: audioExt[1],
    }
  }
  if (data === 'fmt:alb') {
    return { mode: DownloadMode.album, maxHeight: 0 }
  }
  if (data === 'fmt:i') {
    return { mode: DownloadMode.image, maxHeight: 0 }
  }
  if (data === 'fmt:f') {
    return { mode: DownloadMode.file, maxHeight: 0 }
  }
  const image = /^fmt:i:(\d+)$/.exec(data)
  if (image) {
    return {
      mode: DownloadMode.image,
      maxHeight: Number(image[1]) || 0,
    }
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
