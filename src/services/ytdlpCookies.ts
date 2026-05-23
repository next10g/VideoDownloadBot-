import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { resolve } from 'path'
import { cwd } from 'process'
import env from '@/helpers/env'
import logger from '@/lib/logger'

let loggedPath: string | undefined

export function isYoutubeBotBlock(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('sign in to confirm') ||
    m.includes("you're not a bot") ||
    m.includes('not a bot') ||
    m.includes('cookies-from-browser')
  )
}

export async function resolveCookiesPath(): Promise<string | undefined> {
  const candidates = [
    env.COOKIES_PATH_RESOLVED,
    resolve(cwd(), 'cookie'),
    resolve(cwd(), 'cookies.txt'),
  ].filter((p): p is string => Boolean(p))

  for (const filePath of candidates) {
    try {
      await access(filePath, fsConstants.F_OK)
      if (loggedPath !== filePath) {
        loggedPath = filePath
        logger.info('yt-dlp cookies file', { path: filePath })
      }
      return filePath
    } catch {
      // try next
    }
  }
  return undefined
}
