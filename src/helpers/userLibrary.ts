import { detectPlatform } from '@/helpers/detectPlatform'
import { DownloadMode } from '@/models/DownloadMode'
import { UserSavedLinkModel } from '@/models/UserSavedLink'

const MAX_SAVED = 50

export async function saveUserLink(
  telegramId: number,
  url: string,
  options: {
    title?: string
    downloadMode: DownloadMode
    bytes?: number
    fileType?: string
  }
): Promise<void> {
  const count = await UserSavedLinkModel.countDocuments({ telegramId })
  if (count >= MAX_SAVED) {
    const oldest = await UserSavedLinkModel.findOne({ telegramId })
      .sort({ createdAt: 1 })
      .exec()
    if (oldest) {
      await oldest.deleteOne()
    }
  }
  await UserSavedLinkModel.create({
    telegramId,
    url,
    title: options.title?.slice(0, 200) || '',
    platform: detectPlatform(url),
    downloadMode: options.downloadMode,
    bytes: options.bytes ?? 0,
    fileType: options.fileType ?? options.downloadMode,
  })
}

export async function listUserLinks(telegramId: number, limit = 15) {
  return UserSavedLinkModel.find({ telegramId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
}
