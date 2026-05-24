import type { MediaFormatOffer } from '@/services/mediaProbe'
import type { FacebookEmbedResult } from '@/services/facebookEmbed'

export interface StoredMediaProbe {
  title: string
  description?: string
  videoHeights: number[]
  imageSizes: number[]
  audioExts: string[]
  hasImage: boolean
  hasAudio: boolean
  hasAlbum: boolean
  albumUrls: string[]
  isFile: boolean
  facebook?: FacebookEmbedResult
  downloadUrl?: string
}

export function storeProbe(offer: MediaFormatOffer): string {
  return JSON.stringify({
    title: offer.title,
    description: offer.description,
    videoHeights: offer.videoHeights,
    imageSizes: offer.imageSizes,
    audioExts: offer.audioExts,
    hasImage: offer.hasImage,
    hasAudio: offer.hasAudio,
    hasAlbum: offer.hasAlbum,
    albumUrls: offer.albumUrls,
    isFile: offer.isFile,
    facebook: offer.facebook,
    downloadUrl: offer.downloadUrl,
  } satisfies StoredMediaProbe)
}

export function loadProbe(raw?: string): StoredMediaProbe | undefined {
  if (!raw?.trim()) {
    return undefined
  }
  try {
    const parsed = JSON.parse(raw) as StoredMediaProbe
    return {
      ...parsed,
      imageSizes: parsed.imageSizes ?? [],
      audioExts: parsed.audioExts ?? [],
      albumUrls: parsed.albumUrls ?? [],
      hasAlbum: parsed.hasAlbum ?? false,
      isFile: parsed.isFile ?? false,
    }
  } catch {
    return undefined
  }
}
