import 'module-alias/register'
import 'reflect-metadata'
import 'source-map-support/register'

import { createServer, Server } from 'http'
import { mkdir } from 'fs/promises'
import { webhookCallback } from 'grammy'
import { ignoreOld } from 'grammy-middlewares'
import attachUser from '@/middlewares/attachUser'
import requiredSubscription from '@/middlewares/requiredSubscription'
import bot from '@/helpers/bot'
import cleanupDownloadJobs from '@/helpers/cleanupDownloadJobs'
import configureI18n from '@/middlewares/configureI18n'
import downloadQueue from '@/helpers/downloadQueue'
import env from '@/helpers/env'
import handleAudio from '@/handlers/audio'
import handleImage from '@/handlers/image'
import {
  handleAutoMode,
  handleCarouselMode,
  handleModeCallback,
  handleMenuCallback,
  handleVideoMode,
} from '@/handlers/mode'
import {
  handleAdminCallback,
  handleAdminPanel,
  handleAdminUsers,
} from '@/handlers/admin'
import { syncBotProfileUserCount } from '@/helpers/botProfileSync'
import { syncBotCommands } from '@/helpers/syncBotCommands'
import handleHelp from '@/handlers/help'
import handleLanguage from '@/handlers/language'
import handleUrl from '@/handlers/url'
import handleStart from '@/handlers/start'
import handlePhoto from '@/handlers/photo'
import handleRefer from '@/handlers/refer'
import handleMyLinks from '@/handlers/mylinks'
import handleStatsMe from '@/handlers/statsme'
import handleSticker from '@/handlers/sticker'
import handleContact from '@/handlers/contact'
import handleZipCommand from '@/handlers/zip'
import { handleAdminStats } from '@/handlers/admin'
import {
  handleRetryDownload,
  handleRetrySubscription,
} from '@/handlers/callbacks'
import {
  handleFormatChoice,
  handleShareBot,
} from '@/handlers/formatCallback'
import { collectHealthDiagnostics } from '@/helpers/healthDiagnostics'
import i18n from '@/helpers/i18n'
import languageMenu from '@/menus/language'
import report from '@/helpers/report'
import { isBenignTelegramError } from '@/helpers/telegramErrors'
import { resolveFfmpegPath } from '@/services/ffmpegPath'
import { initYoutubeFetchAgent } from '@/services/youtubeFetchInit'
import { logYoutubePublicMode } from '@/services/youtubeDownload'
import { initYtdlpOptions } from '@/services/ytdlpOptions'
import startMongo from '@/helpers/startMongo'
import { startTempMaintenance } from '@/helpers/tempMaintenance'
import { TEMP_ROOT } from '@/helpers/tempDir'
import logger from '@/lib/logger'
import {
  gracefulCleanup,
  registerProcessLifecycle,
  stopWatchdog,
} from '@/lib/processLifecycle'

let httpServer: Server | undefined
let tempMaintenanceTimer: NodeJS.Timeout | undefined

async function runApp() {
  registerProcessLifecycle()
  logger.info('starting app', { environment: env.ENVIRONMENT })

/*
  const startup = await runStartupChecks()
  for (const warning of startup.warnings) {
    logger.warn('startup warning', { warning })
  }
  if (!startup.ok) {
    for (const error of startup.errors) {
      logger.error('startup check failed', { error })
    }
    throw new Error(
      `Startup checks failed:\n${startup.errors.map((e) => `- ${e}`).join('\n')}`
    )
  }
*/

  await mkdir(TEMP_ROOT, { recursive: true })
  await startMongo()
  logger.info('mongo connected')
  await resolveFfmpegPath()
  await initYtdlpOptions()
  initYoutubeFetchAgent()
  logYoutubePublicMode()
  await cleanupDownloadJobs()
  tempMaintenanceTimer = startTempMaintenance()

  bot
    .use(ignoreOld())
    .use(attachUser)
    .use(i18n.middleware())
    .use(configureI18n)
    .use(requiredSubscription)
    .use(languageMenu)

  bot.command('start', handleStart)
  bot.command(['help', 'download'], handleHelp)
  bot.command('language', handleLanguage)
  bot.command('audio', handleAudio)
  bot.command('image', handleImage)
  bot.command('carousel', handleCarouselMode)
  bot.command('auto', handleAutoMode)
  bot.command('video', handleVideoMode)
  bot.command('refer', handleRefer)
  bot.command('mylinks', handleMyLinks)
  bot.command('statsme', handleStatsMe)
  bot.command('sticker', handleSticker)
  bot.command('zip', handleZipCommand)
  bot.command('stats', handleAdminStats)
  bot.command('users', handleAdminUsers)
  bot.command('admin', handleAdminPanel)
  bot.callbackQuery('retry_sub', handleRetrySubscription)
  bot.callbackQuery('retry_download', handleRetryDownload)
  bot.callbackQuery(/^fmt:/, handleFormatChoice)
  bot.callbackQuery('action:share', handleShareBot)
  bot.callbackQuery(/^mode:/, handleModeCallback)
  bot.callbackQuery(/^menu:/, handleMenuCallback)
  bot.callbackQuery(/^admin:/, handleAdminCallback)
  bot.callbackQuery('noop:language', async (ctx) => {
    await ctx.answerCallbackQuery()
    return handleLanguage(ctx)
  })
  bot.on('message:photo', handlePhoto)
  bot.on('message:contact', handleContact)
  bot.hears(
    /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/i,
    handleUrl
  )
  bot.use((ctx) => {
    if (ctx.chat?.type === 'private') {
      return handleHelp(ctx)
    }
  })
  bot.catch((botError) => {
    if (isBenignTelegramError(botError.error)) {
      return
    }
    report(botError.error, { ctx: botError.ctx })
  })

  await bot.init()

  const webhookPath = `/webhook/${env.WEBHOOK_SECRET}`
  const webhookHandler = webhookCallback(bot, 'http', {
    secretToken: env.WEBHOOK_SECRET,
    /** Facebook photo probe can take 15–20s; default 10s caused unhandledRejection. */
    timeoutMilliseconds: 55_000,
  })

  httpServer = createServer(async (req, res) => {
    const url = req.url?.split('?')[0]
    try {
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
        return
      }
      if (req.method === 'GET' && url === '/diagnostics') {
        const secret = req.headers['x-webhook-secret']
        if (secret !== env.WEBHOOK_SECRET) {
          res.writeHead(404)
          res.end()
          return
        }
        const diagnostics = await collectHealthDiagnostics()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(diagnostics, null, 2))
        return
      }
      if (req.method === 'POST' && url === webhookPath) {
        return webhookHandler(req, res)
      }
      res.writeHead(404)
      res.end()
    } catch (error) {
      logger.error('http handler error', { error: String(error) })
      res.writeHead(500)
      res.end()
    }
  })

  const webhookUrl = `${env.WEBHOOK_URL.replace(/\/$/, '')}${webhookPath}`
  await bot.api.setWebhook(webhookUrl, {
    secret_token: env.WEBHOOK_SECRET,
    drop_pending_updates: true,
  })

  await new Promise<void>((resolve) => {
    httpServer!.listen(env.PORT, () => resolve())
  })

  logger.info('bot ready', {
    username: bot.botInfo.username,
    port: env.PORT,
    webhookUrl,
    subscription: env.REQUIRED_CHANNEL_ENABLED,
  })

  void syncBotCommands()
  void syncBotProfileUserCount()
  setInterval(() => {
    void syncBotProfileUserCount()
  }, 3_600_000)
}

async function shutdown(signal: string) {
  logger.warn('shutdown signal', { signal })
  stopWatchdog()
  if (tempMaintenanceTimer) {
    clearInterval(tempMaintenanceTimer)
  }
  downloadQueue.cancelCurrentJob()
  await gracefulCleanup(signal)
  await new Promise<void>((resolve) => {
    if (!httpServer) {
      resolve()
      return
    }
    httpServer.close(() => resolve())
  })
  process.exit(0)
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

void runApp().catch((error) => {
  logger.error('fatal startup error', { error: String(error) })
  process.exit(1)
})
