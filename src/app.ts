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
import handleHelp from '@/handlers/help'
import handleLanguage from '@/handlers/language'
import handleUrl from '@/handlers/url'
import {
  handleRetryDownload,
  handleRetrySubscription,
} from '@/handlers/callbacks'
import { collectHealthDiagnostics } from '@/helpers/healthDiagnostics'
import i18n from '@/helpers/i18n'
import languageMenu from '@/menus/language'
import report from '@/helpers/report'
import { resolveFfmpegPath } from '@/services/ffmpegPath'
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
  await cleanupDownloadJobs()
  tempMaintenanceTimer = startTempMaintenance()

  bot
    .use(ignoreOld())
    .use(attachUser)
    .use(i18n.middleware())
    .use(configureI18n)
    .use(requiredSubscription)
    .use(languageMenu)

  bot.command(['help', 'start'], handleHelp)
  bot.command('language', handleLanguage)
  bot.command('audio', handleAudio)
  bot.callbackQuery('retry_sub', handleRetrySubscription)
  bot.callbackQuery('retry_download', handleRetryDownload)
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
    report(botError.error, { ctx: botError.ctx })
  })

  await bot.init()

  const webhookPath = `/webhook/${env.WEBHOOK_SECRET}`
  const webhookHandler = webhookCallback(bot, 'http', {
    secretToken: env.WEBHOOK_SECRET,
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
