import env from '@/helpers/env'

export type YoutubeBackendMode = 'piped' | 'ytdlp' | 'auto'

export function youtubeBackendMode(): YoutubeBackendMode {
  return env.YOUTUBE_BACKEND as YoutubeBackendMode
}

/** Piped + Invidious (no cookies). */
export function useProxyYoutubeApis(): boolean {
  const mode = youtubeBackendMode()
  return mode === 'piped' || mode === 'auto'
}

export function usePipedForYoutube(): boolean {
  return useProxyYoutubeApis()
}

export function useYtdlpForYoutube(): boolean {
  const mode = youtubeBackendMode()
  return mode === 'ytdlp' || mode === 'auto'
}
