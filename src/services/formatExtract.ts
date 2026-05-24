import env from '@/helpers/env'

const AUDIO_EXT_ORDER = ['m4a', 'mp3', 'opus', 'aac', 'ogg', 'webm', 'wav']

export interface ParsedMediaFormats {
  videoHeights: number[]
  imageSizes: number[]
  audioExts: string[]
  hasAudio: boolean
  hasImage: boolean
}

function parseHeightFromFormat(format: Record<string, unknown>): number {
  const h = Number(format.height ?? 0)
  if (h > 0) {
    return h
  }
  const res = String(format.resolution || format.format_note || '')
  const match = res.match(/(\d{3,4})/)
  return match ? Number(match[1]) : 0
}

function sortAudioExts(exts: Iterable<string>): string[] {
  return [...new Set(exts)].sort((a, b) => {
    const ia = AUDIO_EXT_ORDER.indexOf(a)
    const ib = AUDIO_EXT_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

/** Parse yt-dlp `formats` into real video/image/audio choices for the menu. */
export function parseYtdlpFormats(
  formats: Record<string, unknown>[] | undefined
): ParsedMediaFormats {
  if (!formats?.length) {
    return {
      videoHeights: [],
      imageSizes: [],
      audioExts: [],
      hasAudio: false,
      hasImage: false,
    }
  }

  const videoHeights = new Set<number>()
  const imageSizes = new Set<number>()
  const audioExts = new Set<string>()
  let hasAudio = false
  let hasImage = false

  for (const f of formats) {
    const vcodec = String(f.vcodec || '')
    const acodec = String(f.acodec || '')
    const ext = String(f.ext || '').toLowerCase()
    const isImageExt = /^jpe?g|png|webp|gif$/i.test(ext)

    if (vcodec !== 'none' && vcodec !== '') {
      const h = parseHeightFromFormat(f)
      if (h > 0) {
        videoHeights.add(h)
      }
    }

    if (acodec !== 'none' && acodec !== '' && vcodec === 'none') {
      hasAudio = true
      if (ext) {
        audioExts.add(ext)
      }
    }

    if (isImageExt && (vcodec === 'none' || vcodec === '')) {
      hasImage = true
      const w = Number(f.width ?? 0)
      const h = Number(f.height ?? 0)
      const dim = Math.max(w, h)
      if (dim > 0) {
        imageSizes.add(dim)
      }
    }
  }

  return {
    videoHeights: [...videoHeights]
      .sort((a, b) => b - a)
      .filter((h) => h <= env.YOUTUBE_MAX_HEIGHT),
    imageSizes: [...imageSizes].sort((a, b) => b - a),
    audioExts: sortAudioExts(audioExts),
    hasAudio,
    hasImage,
  }
}

export function mergeFormatHints(
  parsed: ParsedMediaFormats,
  meta: { ext?: string; height?: number; thumbnails?: { url?: string }[] }
): ParsedMediaFormats {
  const ext = meta.ext || ''
  const h = Number(meta.height ?? 0)
  const hasVideo = ext && !/^jpe?g|png|webp|gif$/i.test(ext)
  const videoHeights =
    parsed.videoHeights.length > 0
      ? parsed.videoHeights
      : h > 0 && hasVideo
        ? [h]
        : hasVideo
          ? [720]
          : []

  const hasImage =
    parsed.hasImage ||
    /^jpe?g|png|webp|gif$/i.test(ext) ||
    Boolean(meta.thumbnails?.[0]?.url)

  const hasAudio =
    parsed.hasAudio || /^m4a|mp3|opus|aac|ogg|webm|wav$/i.test(ext)

  const audioExts =
    parsed.audioExts.length > 0
      ? parsed.audioExts
      : hasAudio && ext.match(/m4a|mp3|opus|aac/i)
        ? sortAudioExts([ext.toLowerCase()])
        : parsed.audioExts

  return {
    ...parsed,
    videoHeights,
    hasImage,
    hasAudio,
    audioExts,
  }
}
