import env from '@/helpers/env'
import { getFfmpegPath } from '@/services/ffmpegPath'
import { resolveCookiePool, shouldLoadYoutubeCookiePool } from '@/services/ytdlpCookies'
import { getYtdlpJsRuntimesFlag, resolveNodeForYtdlp } from '@/services/ytdlpNodeRuntime'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

const maxFilesize = `${env.MAX_FILE_SIZE_MB}M`
/** Prefer progressive HTTPS MP4 (avoid m3u8/HLS on shared hosting). */
const progressiveVideoFormat = [
  `best[ext=mp4][vcodec!=none][acodec!=none][protocol^=http][filesize<=${maxFilesize}]`,
  `best[ext=mp4][protocol^=http][filesize<=${maxFilesize}][height<=720]`,
  `bestvideo[ext=mp4][height<=720][protocol^=http]+bestaudio[ext=m4a][protocol^=http]`,
  `best[height<=720][filesize<=${maxFilesize}]`,
  'best',
].join('/')

export interface DownloadFlagOverrides {
  extractorArgs?: string
  cookiesPath?: string
  /** Looser format (matches working manual yt-dlp on Hostinger). */
  relaxedFormat?: boolean
  maxHeight?: number
  imageMode?: boolean
}

function videoFormat(
  audio: boolean,
  relaxed: boolean,
  maxHeight: number,
  imageMode: boolean
): string {
  if (imageMode) {
    return [
      `best[ext=jpg][filesize<=${maxFilesize}]`,
      `best[ext=webp][filesize<=${maxFilesize}]`,
      `best[ext=png][filesize<=${maxFilesize}]`,
      'best',
    ].join('/')
  }
  if (audio) {
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
  return [
    `best[ext=mp4][vcodec!=none][acodec!=none][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `best[ext=mp4][protocol^=http][filesize<=${maxFilesize}][height<=${h}]`,
    `bestvideo[ext=mp4][height<=${h}][protocol^=http]+bestaudio[ext=m4a][protocol^=http]`,
    `best[height<=${h}][filesize<=${maxFilesize}]`,
    'best',
  ].join('/')
}

let cookiesPoolReady = false

/** Public bot default: no cookies. Optional pool only if YOUTUBE_USE_COOKIES=true. */
function defaultYoutubeExtractorArgs(): string {
  const po = env.YTDLP_YOUTUBE_PO_TOKEN.trim()
  const poSuffix = po ? `;po_token=${po}` : ''
  return `youtube:player_client=android_vr,web_embedded,ios,android,tv;player_skip=webpage,configs${poSuffix}`
}

function socialExtractorArgs(): string {
  return [
    defaultYoutubeExtractorArgs(),
    'tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com',
    'facebook:player_skip=webpage',
  ].join(';')
}

/** Call at startup — Node runtime + optional cookie pool for admin mode. */
export async function initYtdlpOptions(): Promise<void> {
  await resolveNodeForYtdlp()
  if (shouldLoadYoutubeCookiePool()) {
    await resolveCookiePool()
  }
  cookiesPoolReady = true
}

export function buildProbeFlags(): YtDlpFlags {
  return {
    ...baseFlags(),
    skipDownload: true,
    dumpSingleJson: true,
  }
}

export function buildDownloadFlags(
  outputBase: string,
  audio: boolean,
  overrides?: DownloadFlagOverrides
): YtDlpFlags {
  const ffmpeg = getFfmpegPath()
  const imageMode = overrides?.imageMode ?? false
  const maxHeight = overrides?.maxHeight && overrides.maxHeight > 0
    ? overrides.maxHeight
    : env.YOUTUBE_MAX_HEIGHT
  const thumbs = !audio && !imageMode && !env.SKIP_THUMBNAILS

  const relaxed = overrides?.relaxedFormat ?? Boolean(overrides?.cookiesPath)
  const flags: YtDlpFlags = {
    ...baseFlags({
      ...overrides,
      extractorArgs: overrides?.extractorArgs ?? socialExtractorArgs(),
    }),
    quiet: true,
    output: `${outputBase}.%(ext)s`,
    writeInfoJson: true,
    format: videoFormat(audio, relaxed, maxHeight, imageMode),
    formatSort: relaxed
      ? `res:${maxHeight},ext:mp4:m4a,size`
      : `res:${maxHeight},ext:mp4:m4a,proto:https,codec:h264,size`,
  }

  if (ffmpeg) {
    flags.ffmpegLocation = ffmpeg
    if (!audio) {
      flags.mergeOutputFormat = 'mp4'
    }
    if (thumbs) {
      flags.writeThumbnail = true
      flags.convertThumbnails = 'jpg'
    }
  } else if (thumbs) {
    flags.writeThumbnail = true
  }

  return flags
}

function baseFlags(overrides?: DownloadFlagOverrides): YtDlpFlags {
  const flags: YtDlpFlags = {
    noWarnings: true,
    noCheckCertificate: true,
    noPlaylist: true,
    maxFilesize,
    noProgress: true,
    noCacheDir: true,
    noPart: true,
    concurrentFragments: 1,
    retries: 3,
    fragmentRetries: 3,
    socketTimeout: 30,
    matchFilter: env.YTDLP_MATCH_FILTER,
    abortOnUnavailableFragment: true,
    hlsPreferNative: true,
    forceIpv4: true,
    extractorArgs: overrides?.extractorArgs ?? defaultYoutubeExtractorArgs(),
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
