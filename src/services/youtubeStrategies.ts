import env from '@/helpers/env'
import { buildDownloadFlags } from '@/services/ytdlpOptions'
import type { YtDlpFlags } from '@/services/ytdlpTypes'

export interface YoutubeStrategy {
  id: string
  extractorArgs: string
  cookiesPath?: string
}

function poTokenSuffix(): string {
  const token = env.YTDLP_YOUTUBE_PO_TOKEN.trim()
  if (!token) {
    return ''
  }
  return `;po_token=${token}`
}

/** Clients that often work without login cookies (public bot). Order matters. */
export function youtubeStrategiesNoCookies(): YoutubeStrategy[] {
  const po = poTokenSuffix()
  return [
    {
      id: 'android_vr',
      extractorArgs: `youtube:player_client=android_vr,web_embedded,tv_embedded${po}`,
    },
    {
      id: 'ios_android',
      extractorArgs: `youtube:player_client=ios,android;player_skip=webpage,configs${po}`,
    },
    {
      id: 'mweb',
      extractorArgs: `youtube:player_client=mweb,web_safari,web${po}`,
    },
    {
      id: 'tv',
      extractorArgs: `youtube:player_client=tv,tv_simply,mweb,web${po}`,
    },
  ]
}

export function youtubeStrategiesWithCookies(
  cookiesPath: string
): YoutubeStrategy[] {
  const po = poTokenSuffix()
  return [
    {
      id: 'cookies_tv',
      extractorArgs: `youtube:player_client=tv,mweb,web${po}`,
      cookiesPath,
    },
    {
      id: 'cookies_android',
      extractorArgs: `youtube:player_client=android_vr,android,ios${po}`,
      cookiesPath,
    },
  ]
}

export function buildFlagsForYoutubeStrategy(
  outputBase: string,
  audio: boolean,
  strategy: YoutubeStrategy
): YtDlpFlags {
  return buildDownloadFlags(outputBase, audio, {
    extractorArgs: strategy.extractorArgs,
    cookiesPath: strategy.cookiesPath,
  })
}

export { isYoutubeBotBlock as isYoutubeBotBlockMessage } from '@/services/ytdlpCookies'
