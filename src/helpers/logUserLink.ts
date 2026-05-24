import { detectPlatform } from '@/helpers/detectPlatform'
import { saveDbChat } from '@/helpers/saveDbChat'
import { DownloadMode } from '@/models/DownloadMode'
import { LinkLogModel } from '@/models/LinkLog'
import Context from '@/models/Context'

export async function logSubmittedLink(
  ctx: Context,
  url: string,
  options?: {
    downloadMode?: DownloadMode
    maxHeight?: number
    title?: string
  }
): Promise<void> {
  const from = ctx.from
  if (!from) {
    return
  }
  ctx.dbchat.linkCount = (ctx.dbchat.linkCount || 0) + 1
  await saveDbChat(ctx.dbchat)

  await LinkLogModel.create({
    telegramId: from.id,
    username: from.username,
    firstName: from.first_name,
    url,
    platform: detectPlatform(url),
    downloadMode: options?.downloadMode ?? DownloadMode.video,
    maxHeight: options?.maxHeight ?? 0,
    title: options?.title,
  })
}

export async function markLinkLogResult(
  telegramId: number,
  url: string,
  success: boolean,
  errorCode?: string
): Promise<void> {
  const log = await LinkLogModel.findOne({ telegramId, url })
    .sort({ createdAt: -1 })
    .exec()
  if (!log) {
    return
  }
  log.success = success
  if (errorCode) {
    log.errorCode = errorCode
  }
  await log.save()
}
