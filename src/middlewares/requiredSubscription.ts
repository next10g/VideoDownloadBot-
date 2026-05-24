import { NextFunction } from 'grammy'
import { GrammyError } from 'grammy'
import env from '@/helpers/env'
import { isBotAdminId } from '@/helpers/isBotAdmin'
import { buildSubscriptionKeyboard } from '@/helpers/progressKeyboard'
import Context from '@/models/Context'
import logger from '@/lib/logger'

const SUBSCRIBED_STATUSES = new Set([
  'creator',
  'administrator',
  'member',
  'restricted',
])

export async function isUserSubscribed(
  ctx: Context,
  userId: number
): Promise<boolean> {
  if (!env.REQUIRED_CHANNEL_ENABLED || !env.REQUIRED_CHANNEL) {
    return true
  }
  try {
    const member = await ctx.api.getChatMember(
      env.REQUIRED_CHANNEL,
      userId
    )
    if (member.status === 'restricted' && member.is_member) {
      return true
    }
    return SUBSCRIBED_STATUSES.has(member.status)
  } catch (error) {
    if (error instanceof GrammyError) {
      if (error.error_code === 400) {
        logger.warn('subscription check: invalid channel or user', {
          description: error.description,
        })
      }
      if (error.error_code === 403) {
        logger.warn('subscription check: bot lacks permission or user banned', {
          userId,
        })
      }
    }
    return false
  }
}

export default async function requiredSubscription(
  ctx: Context,
  next: NextFunction
) {
  if (!env.REQUIRED_CHANNEL_ENABLED || !env.REQUIRED_CHANNEL) {
    return next()
  }
  if (ctx.chat?.type !== 'private' || !ctx.from) {
    return next()
  }
  if (
    ctx.callbackQuery?.data === 'retry_sub' ||
    ctx.callbackQuery?.data === 'retry_download'
  ) {
    return next()
  }
  if (isBotAdminId(ctx.from.id)) {
    return next()
  }

  const subscribed = await isUserSubscribed(ctx, ctx.from.id)
  if (subscribed) {
    return next()
  }

  const language = ctx.dbchat?.language || 'en'
  const text = ctx.i18n.t('subscription_required')
  const keyboard = buildSubscriptionKeyboard(language)

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({
      text: ctx.i18n.t('subscription_required_short'),
      show_alert: true,
    })
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard })
    } catch {
      await ctx.reply(text, { reply_markup: keyboard })
    }
    return
  }

  await ctx.reply(text, { reply_markup: keyboard })
}
