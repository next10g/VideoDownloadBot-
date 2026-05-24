import { ValidationError } from '@/lib/errors'
import { ytdlpErrorI18nKey } from '@/helpers/ytdlpUserMessage'

const I18N_TO_CODE = {
  error_instagram_restricted: 'instagram_restricted',
  error_instagram_login: 'instagram_login',
} as const

/** Turn known yt-dlp stderr into a ValidationError with a user-facing locale key. */
export function validationErrorFromYtdlp(detail: string): ValidationError | undefined {
  const i18nKey = ytdlpErrorI18nKey(detail)
  if (!i18nKey || !(i18nKey in I18N_TO_CODE)) {
    return undefined
  }
  const code = I18N_TO_CODE[i18nKey as keyof typeof I18N_TO_CODE]
  return new ValidationError(detail.slice(0, 200), code)
}
