import env from '@/helpers/env'
import { isInstagramUrl } from '@/helpers/instagramUrl'

/** Instagram photos/carousels (embed scrape) — disabled by default; reels/video use yt-dlp. */
export function igPhotosEnabled(): boolean {
  return env.IG_PHOTOS_ENABLED && env.ALLOW_CAROUSEL
}

export function skipInstagramPhotoPaths(url: string): boolean {
  return isInstagramUrl(url) && !igPhotosEnabled()
}
