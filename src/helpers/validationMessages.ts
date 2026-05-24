import { ValidationError } from '@/lib/errors'
import Context from '@/models/Context'
import { blockRemainingMinutes, isUserBlocked } from '@/helpers/userAbuse'

const KEY_BY_CODE: Record<ValidationError['code'], string> = {
  invalid_url: 'error_invalid_url',
  file_too_large: 'error_no_suitable_video_size',
  duration_too_long: 'error_duration_too_long',
  livestream: 'error_livestream',
  playlist: 'error_playlist',
  unsupported: 'error_unsupported_url',
  duplicate: 'error_duplicate_url',
  user_limit: 'error_user_job_limit',
  probe_failed: 'error_unsupported_url',
  blacklist: 'error_blacklisted_domain',
  user_blocked: 'error_user_blocked',
  suspicious_extractor: 'error_suspicious_source',
  youtube_bot: 'error_youtube_bot',
  facebook_failed: 'error_facebook_download',
  instagram_restricted: 'error_instagram_restricted',
  instagram_login: 'error_instagram_login',
  instagram_private: 'error_instagram_private',
}

export function validationMessage(ctx: Context, error: ValidationError): string {
  const key = KEY_BY_CODE[error.code] || 'error_unsupported_url'
  if (error.code === 'user_blocked') {
    return ctx.i18n.t(key, {
      minutes: String(blockRemainingMinutes(ctx.dbchat.telegramId)),
    })
  }
  return ctx.i18n.t(key)
}

export function blockedUserMessage(ctx: Context): string {
  return ctx.i18n.t('error_user_blocked', {
    minutes: String(blockRemainingMinutes(ctx.dbchat.telegramId)),
  })
}

export function isBlockedUser(ctx: Context): boolean {
  return isUserBlocked(ctx.dbchat.telegramId)
}
