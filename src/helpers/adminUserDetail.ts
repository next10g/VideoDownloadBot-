import { InlineKeyboard } from 'grammy'
import bot from '@/helpers/bot'
import { formatBytesGb } from '@/helpers/userDownloadStats'
import { ChatModel } from '@/models/Chat'
import { LinkLogModel } from '@/models/LinkLog'

export async function fetchProfilePhotoFileId(
  telegramId: number
): Promise<string | undefined> {
  try {
    const photos = await bot.api.getUserProfilePhotos(telegramId, { limit: 1 })
    const sizes = photos.photos[0]
    return sizes?.[sizes.length - 1]?.file_id
  } catch {
    return undefined
  }
}

export async function formatAdminUserHeader(telegramId: number): Promise<string> {
  const user = await ChatModel.findOne({ telegramId }).lean()
  if (!user) {
    return `👤 مستخدم غير موجود: ${telegramId}`
  }

  const name = user.username
    ? `@${user.username}`
    : [user.firstName, user.lastName].filter(Boolean).join(' ') || '—'

  const phone = user.phoneNumber || '— (لم يُشارك الرقم)'
  const bytes = formatBytesGb(user.totalBytesDownloaded ?? 0)
  const counts = user.fileTypeCounts ?? {}
  const typeLines = Object.entries(counts)
    .map(([k, v]) => `  · ${k}: ${v}`)
    .join('\n')

  return [
    '👤 بيانات المستخدم',
    '',
    `الاسم: ${name}`,
    `المعرّف: ${telegramId}`,
    `الهاتف: ${phone}`,
    `الروابط المرسلة: ${user.linkCount ?? 0}`,
    `تحميلات ناجحة: ${user.successDownloadCount ?? 0}`,
    `الحجم الإجمالي: ${bytes}`,
    typeLines ? `حسب النوع:\n${typeLines}` : '',
    `إحالات: ${user.referralCount ?? 0}`,
    `اللغة: ${user.language}`,
    `الوضع: ${user.downloadPreference}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function formatAdminUserLinks(
  telegramId: number,
  page = 0,
  pageSize = 12
): Promise<string> {
  const skip = page * pageSize
  const logs = await LinkLogModel.find({ telegramId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()
  const total = await LinkLogModel.countDocuments({ telegramId })

  const lines = [
    `🔗 روابط المستخدم (${skip + 1}–${skip + logs.length} / ${total})`,
    '',
  ]

  if (logs.length === 0) {
    lines.push('— لا روابط')
    return lines.join('\n')
  }

  for (const log of logs) {
    const ok = log.success === true ? '✅' : log.success === false ? '❌' : '⏳'
    lines.push(`${ok} ${log.platform} · ${log.title || '—'}`)
    lines.push(`  ${String(log.url).slice(0, 100)}`)
  }

  return lines.join('\n')
}

export function adminUserLinksKeyboard(telegramId: number, page: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('◀️', `admin:ulink:${telegramId}:${page - 1}`)
    .text('▶️', `admin:ulink:${telegramId}:${page + 1}`)
    .row()
    .text('« المستخدم', `admin:user:${telegramId}:0`)
    .text('« لوحة الأدمن', 'admin:panel')
}
