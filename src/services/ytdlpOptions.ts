import env from '@/helpers/env'
import { getFfmpegPath } from '@/services/ffmpegPath'
import { resolveCookiesPath } from '@/services/ytdlpCookies'
import { getYtdlpJsRuntimesFlag, resolveNodeForYtdlp } from '@/services/ytdlpNodeRuntime'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

const maxFilesize = `${env.MAX_FILE_SIZE_MB}M`

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
      : `best[ext=mp4][filesize<=${maxFilesize}]/best[filesize<=${maxFilesize}]/bestvideo*+bestaudio/best`,
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
  if (cachedCookiesPath) {
    return 'youtube:player_client=web,mweb,android'
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
