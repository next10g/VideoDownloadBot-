import { InlineKeyboard } from 'grammy'
import { ChatModel } from '@/models/Chat'
import { LinkLogModel } from '@/models/LinkLog'
import { collectBotStats, formatBotStats } from '@/helpers/botStats'
import { formatBytesGb } from '@/helpers/userDownloadStats'

export async function formatAdminPanel(): Promise<string> {
  return formatBotStats(await collectBotStats())
}

export async function formatAdminUsersPage(
  page = 0,
  pageSize = 12
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const skip = page * pageSize
  const users = await ChatModel.find()
    .sort({ linkCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()

  const total = await ChatModel.countDocuments()
  const lines = [
    `👥 المستخدمون (${skip + 1}–${skip + users.length} / ${total})`,
    '',
    'اضغط على مستخدم لعرض بياناته وروابطه:',
    '',
  ]

  const kb = new InlineKeyboard()

  if (users.length === 0) {
    lines.push('— لا مستخدمين')
  } else {
    for (const u of users) {
      const name = u.username
        ? `@${u.username}`
        : [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'
      const phone = u.phoneNumber ? `📱 ${u.phoneNumber}` : ''
      const dl = formatBytesGb(u.totalBytesDownloaded ?? 0)
      lines.push(
        `• ${name}`,
        `  🆔 ${u.telegramId} | 🔗 ${u.linkCount ?? 0} | ⬇️ ${dl} ${phone}`
      )
      kb.text(name.slice(0, 20), `admin:user:${u.telegramId}:0`).row()
    }
  }

  kb.text('◀️', `admin:users:${page - 1}`)
    .text('▶️', `admin:users:${page + 1}`)
    .row()
    .text('🔗 كل الروابط', 'admin:links:0')
    .row()
    .text('« لوحة الأدمن', 'admin:panel')

  lines.push('', 'الهاتف يظهر فقط لو المستخدم شاركه مع البوت.')

  return { text: lines.join('\n'), keyboard: kb }
}

export async function formatAdminLinksPage(page = 0, pageSize = 20): Promise<string> {
  const skip = page * pageSize
  const logs = await LinkLogModel.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()

  const total = await LinkLogModel.countDocuments()
  const lines = [
    `🔗 آخر الروابط (${skip + 1}–${skip + logs.length} / ${total})`,
    '',
  ]

  for (const log of logs) {
    const ok = log.success === true ? '✅' : log.success === false ? '❌' : '⏳'
    const user = log.username ? `@${log.username}` : log.firstName || log.telegramId
    lines.push(`${ok} ${log.platform} · ${user}`)
    lines.push(`  ${String(log.url).slice(0, 120)}`)
  }

  return lines.join('\n')
}
