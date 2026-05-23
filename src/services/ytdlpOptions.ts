import { existsSync } from 'fs'
import { resolve } from 'path'
import { cwd } from 'process'
import env from '@/helpers/env'
import { getFfmpegPath } from '@/services/ffmpegPath'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

const maxFilesize = `${env.MAX_FILE_SIZE_MB}M`

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
      : `[filesize<=${maxFilesize}][ext=mp4]/[filesize_approx<=${maxFilesize}][ext=mp4]/[filesize<=${maxFilesize}]/[filesize_approx<=${maxFilesize}]/best[filesize<=${maxFilesize}]/best`,
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
    // Raw thumbnail only — no ffmpeg conversion
    flags.writeThumbnail = true
  }

  return flags
}

function baseFlags(): YtDlpFlags {
  const cookiePath = resolve(cwd(), 'cookie')
  const flags: YtDlpFlags = {
    noWarnings: true,
    noCheckCertificate: true,
    noPlaylist: true,
    maxFilesize,
    noProgress: true,
    noCacheDir: true,
    noPart: true,
    concurrentFragments: 1,
    retries: 2,
    fragmentRetries: 2,
    socketTimeout: 30,
    matchFilter: env.YTDLP_MATCH_FILTER,
    abortOnUnavailableFragment: true,
    hlsPreferNative: true,
    forceIpv4: true,
    extractorArgs: 'youtube:player_client=android,web',
  }
  if (existsSync(cookiePath)) {
    flags.cookies = cookiePath
  }
  const ffmpeg = getFfmpegPath()
  if (ffmpeg) {
    flags.ffmpegLocation = ffmpeg
  }
  return flags
}
