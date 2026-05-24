import env from '@/helpers/env'

export function resolveMaxHeight(requested?: number): number {
  if (requested && requested > 0) {
    return Math.min(requested, env.YOUTUBE_MAX_HEIGHT)
  }
  return env.YOUTUBE_MAX_HEIGHT
}
