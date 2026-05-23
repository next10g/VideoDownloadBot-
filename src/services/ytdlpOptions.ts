import { existsSync } from 'fs'
import { resolve } from 'path'
import { cwd } from 'process'
import env from '@/helpers/env'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

const maxFilesize = `${env.MAX_FILE_SIZE_MB}M`

export function buildProbeFlags(): YtDlpFlags {
  return {
    ...baseFlags(),
    skipDownload: true,
    dumpSingleJson: true,
    simulate: true,
  }
}

export function buildDownloadFlags(outputBase: string, audio: boolean): YtDlpFlags {
  return {
    ...baseFlags(),
    output: `${outputBase}.%(ext)s`,
    writeinfojson: true,
    writethumbnail: !audio && !env.SKIP_THUMBNAILS,
    convertThumbnails: env.SKIP_THUMBNAILS ? undefined : 'jpg',
    mergeOutputFormat: 'mp4',
    format: audio
      ? `bestaudio[filesize<=${maxFilesize}]/bestaudio[filesize_approx<=${maxFilesize}]/bestaudio`
      : `[filesize<=${maxFilesize}][ext=mp4]/[filesize_approx<=${maxFilesize}][ext=mp4]/[filesize<=${maxFilesize}]/[filesize_approx<=${maxFilesize}]`,
  }
}

function baseFlags(): YtDlpFlags {
  const cookiePath = resolve(cwd(), 'cookie')
  const flags: YtDlpFlags = {
    noWarnings: true,
    noCheckCertificate: true,
    noPlaylist: true,
    maxFilesize,
    noCallHome: true,
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
  }
  if (existsSync(cookiePath)) {
    flags.cookies = cookiePath
  }
  return flags
}
