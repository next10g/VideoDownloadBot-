/** How the bot handles the next link the user sends. */
export type DownloadPreference = 'auto' | 'video' | 'audio' | 'image' | 'carousel'

export const DOWNLOAD_PREFERENCES: DownloadPreference[] = [
  'auto',
  'video',
  'audio',
  'image',
  'carousel',
]
