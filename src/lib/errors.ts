export type ValidationErrorCode =
  | 'invalid_url'
  | 'file_too_large'
  | 'duration_too_long'
  | 'livestream'
  | 'playlist'
  | 'unsupported'
  | 'duplicate'
  | 'user_limit'
  | 'probe_failed'
  | 'blacklist'
  | 'user_blocked'
  | 'suspicious_extractor'
  | 'youtube_bot'
  | 'facebook_failed'
  | 'instagram_restricted'
  | 'instagram_login'
  | 'instagram_private'

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly code: ValidationErrorCode = 'probe_failed'
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError
}
