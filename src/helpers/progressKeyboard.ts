import { InlineKeyboard } from 'grammy'
import env from '@/helpers/env'
import i18n from '@/helpers/i18n'

export function buildRetryKeyboard(language: string): InlineKeyboard {
  return new InlineKeyboard().text(
    i18n.t(language, 'btn_retry'),
    'retry_download'
  )
}

export function buildSubscriptionKeyboard(language: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  const joinUrl = resolveChannelJoinUrl()
  if (joinUrl) {
    keyboard.url(i18n.t(language, 'btn_join_channel'), joinUrl)
  }
  keyboard.row().text(
    i18n.t(language, 'btn_check_subscription'),
    'retry_sub'
  )
  return keyboard
}

function resolveChannelJoinUrl(): string | undefined {
  if (env.REQUIRED_CHANNEL_LINK) {
    return env.REQUIRED_CHANNEL_LINK
  }
  const channel = env.REQUIRED_CHANNEL
  if (!channel) {
    return undefined
  }
  if (channel.startsWith('http://') || channel.startsWith('https://')) {
    return channel
  }
  if (channel.startsWith('@')) {
    return `https://t.me/${channel.slice(1)}`
  }
  return undefined
}
