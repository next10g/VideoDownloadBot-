import {
  DOWNLOAD_PREFERENCES,
  type DownloadPreference,
} from '@/models/DownloadPreference'
import type { Chat } from '@/models/Chat'
import { saveDbChat } from '@/helpers/saveDbChat'
import Context from '@/models/Context'

export function getDownloadPreference(chat: Chat): DownloadPreference {
  const pref = (chat as Chat & { downloadPreference?: DownloadPreference })
    .downloadPreference
  if (pref && DOWNLOAD_PREFERENCES.includes(pref)) {
    return pref
  }
  if (chat.imagePreferred) {
    return 'image'
  }
  if (chat.audio) {
    return 'audio'
  }
  return 'auto'
}

export async function setDownloadPreference(
  ctx: Context,
  preference: DownloadPreference
): Promise<void> {
  const chat = ctx.dbchat as Chat & { downloadPreference?: DownloadPreference }
  chat.downloadPreference = preference
  chat.audio = preference === 'audio'
  chat.imagePreferred = preference === 'image'
  await saveDbChat(ctx.dbchat)
}

export function modeLabelKey(preference: DownloadPreference): string {
  return `mode_label_${preference}`
}
