import env from '@/helpers/env'

export type YoutubeBackendMode = 'piped' | 'ytdlp' | 'auto'

export function youtubeBackendMode(): YoutubeBackendMode {
  return env.YOUTUBE_BACKEND as YoutubeBackendMode
}

/** Public bot default: Piped first (no cookies). */
export function usePipedForYoutube(): boolean {
  const mode = youtubeBackendMode()
  return mode === 'piped' || mode === 'auto'
}

export function useYtdlpForYoutube(): boolean {
  const mode = youtubeBackendMode()
  return mode === 'ytdlp' || mode === 'auto'
}
