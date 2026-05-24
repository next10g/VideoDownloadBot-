import type { MediaFormatOffer } from '@/services/mediaProbe'
import type { FacebookEmbedResult } from '@/services/facebookEmbed'

export interface StoredMediaProbe {
  title: string
  description?: string
  videoHeights: number[]
  hasImage: boolean
  hasAudio: boolean
  facebook?: FacebookEmbedResult
}

export function storeProbe(offer: MediaFormatOffer): string {
  return JSON.stringify({
    title: offer.title,
    description: offer.description,
    videoHeights: offer.videoHeights,
    hasImage: offer.hasImage,
    hasAudio: offer.hasAudio,
    facebook: offer.facebook,
  } satisfies StoredMediaProbe)
}

export function loadProbe(raw?: string): StoredMediaProbe | undefined {
  if (!raw?.trim()) {
    return undefined
  }
  try {
    return JSON.parse(raw) as StoredMediaProbe
  } catch {
    return undefined
  }
}
