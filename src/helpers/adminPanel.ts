import { ChatModel } from '@/models/Chat'
import { LinkLogModel } from '@/models/LinkLog'
import { collectBotStats, formatBotStats } from '@/helpers/botStats'

export async function formatAdminPanel(): Promise<string> {
  return formatBotStats(await collectBotStats())
}

export async function formatAdminUsersPage(page = 0, pageSize = 15): Promise<string> {
  const skip = page * pageSize
  const users = await ChatModel.find()
    .sort({ linkCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean()

  const total = await ChatModel.countDocuments()
  const lines = [
    `👥 <b>المستخدمون</b> (${skip + 1}–${skip + users.length} / ${total})`,
    '',
  ]

  if (users.length === 0) {
    lines.push('— لا مستخدمين')
    return lines.join('\n')
  }

  for (const u of users) {
    const name = u.username
      ? `@${u.username}`
      : [u.firstName, u.lastName].filter(Boolean).join(' ') || '—'
    const links = u.linkCount ?? 0
    lines.push(
      `• <b>${name}</b>`,
      `  ID: <code>${u.telegramId}</code> | روابط: ${links} | إحالات: ${u.referralCount ?? 0}`
    )
  }

  lines.push('', `<i>رقم الهاتف: تيليجرام لا يعطيه للبوت إلا إذا المستخدم شاركه.</i>`)
  return lines.join('\n')
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
    `🔗 <b>آخر الروابط</b> (${skip + 1}–${skip + logs.length} / ${total})`,
    '',
  ]

  for (const log of logs) {
    const ok = log.success === true ? '✅' : log.success === false ? '❌' : '⏳'
    const user = log.username ? `@${log.username}` : log.firstName || log.telegramId
  lines.push(
      `${ok} <b>${log.platform}</b> · ${user}`,
      `  <code>${String(log.url).slice(0, 120)}</code>`
    )
  }

  return lines.join('\n')
}
