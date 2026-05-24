import { isFacebookUrl } from '@/helpers/facebookUrl'
import { isInstagramUrl } from '@/helpers/instagramUrl'
import { extractAlbumImageUrls } from '@/services/albumExtract'
import { buildProbeFlags } from '@/services/ytdlpOptions'
import { runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'
import env from '@/helpers/env'

export function isSocialCarouselUrl(url: string): boolean {
  return isInstagramUrl(url) || isFacebookUrl(url)
}

/** Instagram/Facebook carousels arrive as yt-dlp playlists — not YouTube playlists. */
export function isSocialCarouselMeta(
  meta: YtDlpMetadata,
  url?: string
): boolean {
  if (url && !isSocialCarouselUrl(url)) {
    return false
  }
  const entries = meta.entries
  if (entries && entries.length > 1) {
    return true
  }
  return extractAlbumImageUrls(meta).length > 1
}

function probeTimeoutMs(url: string): number {
  if (isInstagramUrl(url) || isFacebookUrl(url)) {
    return Math.min(env.YTDLP_PROBE_TIMEOUT_MS, 45_000)
  }
  return env.YTDLP_PROBE_TIMEOUT_MS
}

function instagramPhotoProbeFlags(url: string) {
  return {
    ...buildProbeFlags(url),
    noPlaylist: false,
    ignoreNoFormatsError: true,
  }
}

/** Probe IG/FB post and return direct image URLs (carousel or single photo). */
export async function probeSocialImageUrls(url: string): Promise<string[]> {
  const timeout = probeTimeoutMs(url)
  try {
    const raw = await runYtdlpJson(url, buildProbeFlags(url), timeout, 'probe')
    const urls = extractAlbumImageUrls(raw)
    if (urls.length > 0) {
      return urls
    }
  } catch {
    // try relaxed flags for photo-only posts
  }

  if (isInstagramUrl(url)) {
    try {
      const raw = await runYtdlpJson(
        url,
        instagramPhotoProbeFlags(url),
        timeout,
        'probe'
      )
      const urls = extractAlbumImageUrls(raw)
      if (urls.length > 0) {
        return urls
      }
    } catch {
      // fall through
    }
  }

  return []
}
