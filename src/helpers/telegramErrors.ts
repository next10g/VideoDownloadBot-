import { GrammyError } from 'grammy'
import type { InlineKeyboard } from 'grammy'
import type Context from '@/models/Context'

export function isMessageNotModified(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    error.description.includes('message is not modified')
  )
}

export function isQueryTooOld(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    (error.description.includes('query is too old') ||
      error.description.includes('query ID is invalid'))
  )
}

export function isBenignTelegramError(error: unknown): boolean {
  return isMessageNotModified(error) || isQueryTooOld(error)
}

export async function safeAnswerCallback(
  ctx: Context,
  options?: { text?: string }
): Promise<void> {
  try {
    await ctx.answerCallbackQuery(options)
  } catch (error) {
    if (!isQueryTooOld(error)) {
      throw error
    }
  }
}

export async function safeEditMessageText(
  ctx: Context,
  text: string,
  extra?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_markup?: InlineKeyboard
  }
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra)
  } catch (error) {
    if (!isMessageNotModified(error)) {
      throw error
    }
  }
}
