import env from '@/helpers/env'
import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { getFfmpegPath } from '@/services/ffmpegPath'
import { resolveCookiePool, shouldLoadYoutubeCookiePool } from '@/services/ytdlpCookies'
import { getYtdlpJsRuntimesFlag, resolveNodeForYtdlp } from '@/services/ytdlpNodeRuntime'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

const maxFilesize = `${env.MAX_FILE_SIZE_MB}M`
/** Prefer progressive HTTPS MP4 (avoid m3u8/HLS on shared hosting). */
function progressiveVideoFormat(height = 720): string {
  const h = height
  const hasFfmpeg = Boolean(getFfmpegPath())
  const lines = [
    `best[ext=mp4][vcodec!=none][acodec!=none][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `best[ext=mp4][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `best[ext=mp4][height<=${h}][filesize<=${maxFilesize}]`,
    `best[height<=${h}][filesize<=${maxFilesize}]`,
    'best',
  ]
  if (hasFfmpeg) {
    lines.splice(
      2,
      0,
      `bestvideo[ext=mp4][height<=${h}][protocol^=http]+bestaudio[ext=m4a][protocol^=http]`
    )
  }
  return lines.join('/')
}

export interface DownloadFlagOverrides {
  extractorArgs?: string
  cookiesPath?: string
  /** Looser format (matches working manual yt-dlp on Hostinger). */
  relaxedFormat?: boolean
  maxHeight?: number
  imageMode?: boolean
  fileMode?: boolean
  preferredAudioExt?: string
  /** Facebook / TikTok / Instagram share links need site-specific extractor args. */
  sourceUrl?: string
}

function videoFormat(
  audio: boolean,
  relaxed: boolean,
  maxHeight: number,
  imageMode: boolean,
  audioExt?: string,
  fileMode?: boolean
): string {
  if (fileMode) {
    return [
      `best[filesize<=${maxFilesize}]`,
      `best[filesize_approx<=${maxFilesize}]`,
      'best',
    ].join('/')
  }
  if (imageMode) {
    const dim =
      maxHeight > 0 && maxHeight < 9999 ? maxHeight : env.YOUTUBE_MAX_HEIGHT
    return [
      `best[ext=jpg][width<=${dim}][filesize<=${maxFilesize}]`,
      `best[ext=webp][width<=${dim}][filesize<=${maxFilesize}]`,
      `best[ext=png][width<=${dim}][filesize<=${maxFilesize}]`,
      `best[height<=${dim}][filesize<=${maxFilesize}]`,
      'best',
    ].join('/')
  }
  if (audio) {
    if (audioExt) {
      return [
        `bestaudio[ext=${audioExt}][filesize<=${maxFilesize}]`,
        `bestaudio[ext=${audioExt}][filesize_approx<=${maxFilesize}]`,
        `bestaudio[ext=${audioExt}]`,
        'bestaudio',
      ].join('/')
    }
    return `bestaudio[filesize<=${maxFilesize}]/bestaudio[filesize_approx<=${maxFilesize}]/bestaudio`
  }
  const h = maxHeight
  if (relaxed) {
    return [
      `best[ext=mp4][height<=${h}][filesize<=${maxFilesize}]`,
      `best[height<=${h}][filesize<=${maxFilesize}]`,
      'best',
    ].join('/')
  }
  const hasFfmpeg = Boolean(getFfmpegPath())
  const lines = [
    `best[ext=mp4][vcodec!=none][acodec!=none][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `best[ext=mp4][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `best[ext=mp4][height<=${h}][filesize<=${maxFilesize}]`,
    `best[height<=${h}][filesize<=${maxFilesize}]`,
    'best',
  ]
  if (hasFfmpeg) {
    lines.splice(
      2,
      0,
      `bestvideo[ext=mp4][height<=${h}][protocol^=http]+bestaudio[ext=m4a][protocol^=http]`
    )
  }
  return lines.join('/')
}

let cookiesPoolReady = false

/** Public bot default: no cookies. Optional pool only if YOUTUBE_USE_COOKIES=true. */
function defaultYoutubeExtractorArgs(): string {
  const po = env.YTDLP_YOUTUBE_PO_TOKEN.trim()
  const poSuffix = po ? `;po_token=${po}` : ''
  return `youtube:player_client=android_vr,web_embedded,ios,android,tv;player_skip=webpage,configs${poSuffix}`
}

const FB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function socialExtractorArgs(): string {
  return [
    defaultYoutubeExtractorArgs(),
    'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com',
  ].join(';')
}

const FB_HEADERS = [
  'Referer:https://www.facebook.com/',
  `User-Agent:${FB_UA}`,
]

const IG_HEADERS = [
  'Referer:https://www.instagram.com/',
  `User-Agent:${FB_UA}`,
]

/** Call at startup — Node runtime + optional cookie pool for admin mode. */
export async function initYtdlpOptions(): Promise<void> {
  await resolveNodeForYtdlp()
  if (shouldLoadYoutubeCookiePool()) {
    await resolveCookiePool()
  }
  cookiesPoolReady = true
}

export function buildProbeFlags(sourceUrl?: string): YtDlpFlags {
  const socialCarousel =
    Boolean(
      env.ALLOW_CAROUSEL &&
      sourceUrl &&
        (isInstagramUrl(sourceUrl) || isFacebookUrl(sourceUrl))
    )
  const flags: YtDlpFlags = {
    ...baseFlags(undefined, { allowMultiEntryPlaylist: socialCarousel }),
    skipDownload: true,
    dumpSingleJson: true,
  }
  if (sourceUrl && isFacebookUrl(sourceUrl)) {
    flags.addHeader = FB_HEADERS
  } else if (sourceUrl && isInstagramUrl(sourceUrl)) {
    flags.addHeader = IG_HEADERS
    flags.ignoreNoFormatsError = true
  }
  return flags
}

export function buildDownloadFlags(
  outputBase: string,
  audio: boolean,
  overrides?: DownloadFlagOverrides
): YtDlpFlags {
  const ffmpeg = getFfmpegPath()
  const imageMode = overrides?.imageMode ?? false
  const fileMode = overrides?.fileMode ?? false
  const maxHeight = overrides?.maxHeight && overrides.maxHeight > 0
    ? overrides.maxHeight
    : env.YOUTUBE_MAX_HEIGHT
  const thumbs = !audio && !imageMode && !fileMode && !env.SKIP_THUMBNAILS

  const relaxed = overrides?.relaxedFormat ?? Boolean(overrides?.cookiesPath)
  const forFacebook = overrides?.sourceUrl
    ? isFacebookUrl(overrides.sourceUrl)
    : false
  const forInstagram = overrides?.sourceUrl
    ? isInstagramUrl(overrides.sourceUrl)
    : false
  const flags: YtDlpFlags = {
    ...baseFlags({
      ...overrides,
      extractorArgs:
        overrides?.extractorArgs ?? socialExtractorArgs(),
    }),
    quiet: true,
    output: `${outputBase}.%(ext)s`,
    writeInfoJson: true,
    format: videoFormat(
      audio,
      relaxed,
      maxHeight,
      imageMode,
      overrides?.preferredAudioExt,
      fileMode
    ),
    formatSort: relaxed
      ? `res:${maxHeight},ext:mp4:m4a,size`
      : `res:${maxHeight},ext:mp4:m4a,proto:https,codec:h264,size`,
  }

  if (ffmpeg) {
    flags.ffmpegLocation = ffmpeg
    if (!audio && !imageMode && !fileMode) {
      flags.mergeOutputFormat = 'mp4'
    }
    if (thumbs) {
      flags.writeThumbnail = true
      flags.convertThumbnails = 'jpg'
    }
  } else if (thumbs) {
    flags.writeThumbnail = true
  }

  if (forFacebook) {
    flags.addHeader = FB_HEADERS
  } else if (forInstagram) {
    flags.addHeader = IG_HEADERS
  }

  return flags
}

function baseFlags(
  overrides?: DownloadFlagOverrides,
  opts?: { allowMultiEntryPlaylist?: boolean }
): YtDlpFlags {
  const flags: YtDlpFlags = {
    noWarnings: true,
    noCheckCertificate: true,
    maxFilesize,
    noProgress: true,
    noCacheDir: true,
    noPart: true,
    concurrentFragments: 1,
    retries: 5,
    fragmentRetries: 5,
    extractorRetries: 3,
    socketTimeout: 30,
    matchFilter: env.YTDLP_MATCH_FILTER,
    abortOnUnavailableFragment: true,
    hlsPreferNative: true,
    forceIpv4: true,
    extractorArgs: overrides?.extractorArgs ?? defaultYoutubeExtractorArgs(),
  }
  if (opts?.allowMultiEntryPlaylist) {
    flags.yesPlaylist = true
  } else {
    flags.noPlaylist = true
  }
  const jsRuntimes = getYtdlpJsRuntimesFlag()
  if (jsRuntimes) {
    flags.jsRuntimes = jsRuntimes
  }
  const cookiesPath = overrides?.cookiesPath
  if (cookiesPath) {
    flags.cookies = cookiesPath
  }
  const ffmpeg = getFfmpegPath()
  if (ffmpeg) {
    flags.ffmpegLocation = ffmpeg
  }
  return flags
}

export function isYtdlpOptionsReady(): boolean {
  return cookiesPoolReady
}
