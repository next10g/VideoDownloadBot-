import env from '@/helpers/env'
import { getFfmpegPath } from '@/services/ffmpegPath'
import { resolveCookiesPath } from '@/services/ytdlpCookies'
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

let cachedCookiesPath: string | undefined
let cookiesResolved = false

async function ensureCookiesPath(): Promise<void> {
  if (!cookiesResolved) {
    cachedCookiesPath = await resolveCookiesPath()
    cookiesResolved = true
  }
}

/** Call at startup so downloads include cookies + Node JS runtime when available. */
export async function initYtdlpOptions(): Promise<void> {
  await resolveNodeForYtdlp()
  await ensureCookiesPath()
}

export function buildProbeFlags(): YtDlpFlags {
  return {
    ...baseFlags(),
    skipDownload: true,
    dumpSingleJson: true,
  }
}

export function buildDownloadFlags(outputBase: string, audio: boolean): YtDlpFlags {
  const ffmpeg = getFfmpegPath()
  const thumbs = !audio && !env.SKIP_THUMBNAILS

  const flags: YtDlpFlags = {
    ...baseFlags(),
    quiet: true,
    output: `${outputBase}.%(ext)s`,
    writeInfoJson: true,
    format: audio
      ? `bestaudio[filesize<=${maxFilesize}]/bestaudio[filesize_approx<=${maxFilesize}]/bestaudio`
      : progressiveVideoFormat,
    formatSort: 'res:720,ext:mp4:m4a,proto:https,codec:h264,size',
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

function youtubeExtractorArgs(): string {
  if (cachedCookiesPath && getYtdlpJsRuntimesFlag()) {
    return 'youtube:player_client=tv,mweb,web'
  }
  if (cachedCookiesPath) {
    return 'youtube:player_client=tv,mweb,web,android'
  }
  return 'youtube:player_client=android,ios,tv,web;player_skip=webpage,configs'
}

function baseFlags(): YtDlpFlags {
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
    extractorArgs: youtubeExtractorArgs(),
  }
  const jsRuntimes = getYtdlpJsRuntimesFlag()
  if (jsRuntimes) {
    flags.jsRuntimes = jsRuntimes
  }
  if (cachedCookiesPath) {
    flags.cookies = cachedCookiesPath
  }
  const ffmpeg = getFfmpegPath()
  if (ffmpeg) {
    flags.ffmpegLocation = ffmpeg
  }
  return flags
}
