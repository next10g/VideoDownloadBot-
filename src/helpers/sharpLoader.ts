import logger from '@/lib/logger'

type SharpModule = typeof import('sharp')

let sharpModule: SharpModule | null | undefined

/** Lazy-load sharp so the bot starts even if native binaries are missing. */
export async function loadSharp(): Promise<SharpModule | null> {
  if (sharpModule !== undefined) {
    return sharpModule
  }
  try {
    const mod = await import('sharp')
    sharpModule = ('default' in mod ? mod.default : mod) as SharpModule
    return sharpModule
  } catch (error) {
    sharpModule = null
    logger.warn('sharp unavailable; thumbnails will be skipped or used as-is', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
