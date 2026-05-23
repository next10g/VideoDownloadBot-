import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { GrammyError, InputFile } from 'grammy'
import { Message } from '@grammyjs/types'
import bot from '@/helpers/bot'
import env from '@/helpers/env'
import i18n from '@/helpers/i18n'
import logger from '@/lib/logger'
import { metrics } from '@/lib/metrics'
import videoUploadBot from '@/helpers/videoUploadBot'
import withTimeout from '@/helpers/withTimeout'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof GrammyError)) {
    return undefined
  }
  if (error.error_code === 429) {
    const retryAfter = error.parameters?.retry_after
    return typeof retryAfter === 'number' ? retryAfter * 1000 : 5_000
  }
  if (error.error_code >= 500) {
    return env.UPLOAD_RETRY_BASE_MS * 2
  }
  return undefined
}

function isRetryable(error: unknown): boolean {
  if (error instanceof GrammyError) {
    return error.error_code === 429 || error.error_code >= 500
  }
  if (error instanceof Error && error.message.includes('timed out')) {
    return true
  }
  return false
}

function buildInputFile(file: string | InputFile): InputFile | string {
  if (file instanceof InputFile) {
    return file
  }
  if (!file.includes('/') && !file.includes('\\')) {
    return file
  }
  return new InputFile(createReadStream(file), file.split(/[/\\]/).pop())
}

export default async function sendCompletedFile(
  chatId: number,
  messageId: number,
  language: string,
  audio: boolean,
  title: string,
  file: string | InputFile,
  thumb?: InputFile | string
): Promise<string> {
  const isCachedFileId =
    typeof file === 'string' && !file.includes('/') && !file.includes('\\')

  if (isCachedFileId) {
    logger.info('upload using cached file_id', { chatId })
    return sendCachedFileId(
      chatId,
      messageId,
      language,
      audio,
      title,
      file,
      thumb
    )
  }

  const filePath = typeof file === 'string' ? file : undefined
  let fileSize = 0
  if (filePath) {
    const fileStat = await stat(filePath)
    fileSize = fileStat.size
    if (fileStat.size > env.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Downloaded file exceeds limit (${env.MAX_FILE_SIZE_MB}MB)`
      )
    }
    logger.info('upload start', {
      chatId,
      bytes: fileStat.size,
      mb: Math.round((fileStat.size / 1024 / 1024) * 10) / 10,
    })
  }

  const sendDocumentConfig = {
    caption: i18n.t(language, 'video_caption', {
      bot: bot.botInfo.username,
      title: (title || '').replace('<', '&lt;').replace('>', '&gt;'),
    }),
    parse_mode: 'HTML' as const,
    reply_to_message_id: messageId,
    thumb: audio
      ? undefined
      : thumb instanceof InputFile
        ? thumb
        : thumb
          ? new InputFile(thumb)
          : undefined,
    supports_streaming: true,
  }

  const botToSend = videoUploadBot
  let lastError: unknown

  for (let attempt = 0; attempt <= env.UPLOAD_MAX_RETRIES; attempt++) {
    const uploadFile = buildInputFile(file)
    try {
      const sentMessage = await withTimeout(
        sendOnce(botToSend, chatId, audio, uploadFile, sendDocumentConfig),
        env.UPLOAD_TIMEOUT_MS,
        'Telegram upload'
      )
      const fileId = extractFileId(sentMessage)
      if (!fileId) {
        throw new Error('File id not found in Telegram response')
      }
      metrics.increment('uploadsCompleted')
      logger.info('upload complete', { chatId, attempt, fileSize })
      return fileId
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt >= env.UPLOAD_MAX_RETRIES) {
        break
      }
      const floodMs = getRetryAfterMs(error)
      const delayMs = floodMs ?? env.UPLOAD_RETRY_BASE_MS * 2 ** attempt
      logger.warn('upload retry', {
        attempt: attempt + 1,
        chatId,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      })
      await sleep(delayMs)
    }
  }

  metrics.increment('uploadFailures')
  throw lastError
}

async function sendCachedFileId(
  chatId: number,
  messageId: number,
  language: string,
  audio: boolean,
  title: string,
  fileId: string,
  thumb?: InputFile | string
): Promise<string> {
  const config = {
    caption: i18n.t(language, 'video_caption', {
      bot: bot.botInfo.username,
      title: (title || '').replace('<', '&lt;').replace('>', '&gt;'),
    }),
    parse_mode: 'HTML' as const,
    reply_to_message_id: messageId,
    thumb: audio
      ? undefined
      : thumb instanceof InputFile
        ? thumb
        : thumb
          ? new InputFile(thumb)
          : undefined,
  }
  try {
    if (audio) {
      await bot.api.sendAudio(chatId, fileId, config)
    } else {
      await bot.api.sendVideo(chatId, fileId, config)
    }
  } catch {
    await bot.api.sendDocument(chatId, fileId, config)
  }
  return fileId
}

async function sendOnce(
  botToSend: typeof videoUploadBot,
  chatId: number,
  audio: boolean,
  file: InputFile | string,
  config: Parameters<typeof bot.api.sendVideo>[2]
): Promise<
  Message.VideoMessage | Message.AudioMessage | Message.DocumentMessage
> {
  try {
    return audio
      ? await botToSend.api.sendAudio(chatId, file, config)
      : await botToSend.api.sendVideo(chatId, file, config)
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 429) {
      throw error
    }
    return botToSend.api.sendDocument(chatId, file, config)
  }
}

function extractFileId(
  sentMessage:
    | Message.VideoMessage
    | Message.AudioMessage
    | Message.DocumentMessage
): string | undefined {
  if ('video' in sentMessage) {
    return sentMessage.video.file_id
  }
  if ('audio' in sentMessage) {
    return sentMessage.audio.file_id
  }
  if ('document' in sentMessage) {
    return sentMessage.document.file_id
  }
  return undefined
}
