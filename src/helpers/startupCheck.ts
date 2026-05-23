import { access, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { constants as fsConstants } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import mongoose from 'mongoose'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { TEMP_ROOT } from '@/helpers/tempDir'

const execFileAsync = promisify(execFile)

export interface StartupCheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

async function commandExists(
  command: string,
  args: string[]
): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

async function checkYtdlpBinary(binaryPath: string): Promise<boolean> {
  try {
    await access(binaryPath, fsConstants.F_OK)
    await execFileAsync(binaryPath, ['--version'], { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

export async function runStartupChecks(): Promise<StartupCheckResult> {
  const errors: string[] = []
  const warnings: string[] = []

  const webhookUrl = env.WEBHOOK_URL.trim()
  if (!webhookUrl.startsWith('https://')) {
    errors.push(
      `WEBHOOK_URL must use HTTPS (current value starts with "${webhookUrl.slice(0, 12)}…")`
    )
  }
  if (env.WEBHOOK_SECRET.trim().length < 16) {
    warnings.push('WEBHOOK_SECRET should be at least 16 characters')
  }

  if (
    env.MONGO.includes('<db_password>') ||
    env.MONGO.includes('YOUR_PASSWORD') ||
    env.MONGO.includes('changeme')
  ) {
    errors.push(
      'MONGO still contains a placeholder password — replace <db_password> with your real MongoDB password (URL-encode special characters)'
    )
  } else {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(env.MONGO, { serverSelectionTimeoutMS: 10_000 })
      }
      logger.info('startup: mongodb ok')
    } catch (error) {
      errors.push(
        `MongoDB connection failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  try {
    await mkdir(TEMP_ROOT, { recursive: true })
    const probe = join(TEMP_ROOT, `.write-test-${Date.now()}`)
    await writeFile(probe, 'ok')
    await rm(probe)
    logger.info('startup: temp dir writable', { path: TEMP_ROOT })
  } catch (error) {
    errors.push(
      `Temp directory not writable (${TEMP_ROOT}): ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const ytdlpPath = '/tmp/yt-dlp'
  const ytdlpOk = await checkYtdlpBinary(ytdlpPath)
  if (ytdlpOk) {
    logger.info('startup: yt-dlp ok', { path: ytdlpPath })
  } else {
    errors.push(
      `yt-dlp failed at ${ytdlpPath} — check if ensure-ytdlp.js ran correctly`
    )
  }

  const hasFfmpeg = await commandExists('ffmpeg', ['-version'])
  if (!hasFfmpeg) {
    warnings.push('ffmpeg not found on PATH — install ffmpeg for best compatibility')
  }

  if (env.REQUIRED_CHANNEL_ENABLED && env.REQUIRED_CHANNEL) {
    if (
      !env.REQUIRED_CHANNEL_LINK &&
      !env.REQUIRED_CHANNEL.startsWith('@')
    ) {
      warnings.push(
        'REQUIRED_CHANNEL is set but no @username or REQUIRED_CHANNEL_LINK — private channel joins may fail'
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}