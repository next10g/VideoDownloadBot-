import env from '@/helpers/env'
import { isInstagramUrl } from '@/helpers/instagramUrl'

/** Instagram photos/carousels via embed (works when yt-dlp is rate-limited on hosting). */
export function igPhotosEnabled(): boolean {
  return env.ALLOW_CAROUSEL && (env.IG_PHOTOS_ENABLED || env.IG_EMBED_FALLBACK)
}

export function igEmbedFallback(): boolean {
  return env.IG_EMBED_FALLBACK
}

export function skipInstagramPhotoPaths(url: string): boolean {
  return isInstagramUrl(url) && !igPhotosEnabled()
}
