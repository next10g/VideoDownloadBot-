import { ChatModel } from '@/models/Chat'
import { LinkLogModel } from '@/models/LinkLog'

export interface BotStatsSnapshot {
  totalUsers: number
  newUsers7d: number
  totalLinks: number
  successLinks: number
  failedLinks: number
  topPlatforms: { platform: string; count: number }[]
  topUsers: {
    telegramId: number
    username?: string
    firstName?: string
    count: number
  }[]
  referrals: number
}

export async function collectBotStats(): Promise<BotStatsSnapshot> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    newUsers7d,
    totalLinks,
    successLinks,
    failedLinks,
    topPlatforms,
    topUsers,
    referrals,
  ] = await Promise.all([
    ChatModel.countDocuments(),
    ChatModel.countDocuments({ createdAt: { $gte: since7d } }),
    LinkLogModel.countDocuments(),
    LinkLogModel.countDocuments({ success: true }),
    LinkLogModel.countDocuments({ success: false }),
    LinkLogModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    LinkLogModel.aggregate<{
      _id: number
      count: number
      username?: string
      firstName?: string
    }>([
      { $group: { _id: '$telegramId', count: { $sum: 1 }, username: { $first: '$username' }, firstName: { $first: '$firstName' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    ChatModel.countDocuments({ referredBy: { $exists: true, $ne: null } }),
  ])

  return {
    totalUsers,
    newUsers7d,
    totalLinks,
    successLinks,
    failedLinks,
    topPlatforms: topPlatforms.map((p) => ({
      platform: p._id,
      count: p.count,
    })),
    topUsers: topUsers.map((u) => ({
      telegramId: u._id,
      username: u.username,
      firstName: u.firstName,
      count: u.count,
    })),
    referrals,
  }
}

export function formatBotStats(stats: BotStatsSnapshot): string {
  const lines = [
    '📊 <b>إحصائيات البوت</b>',
    '',
    `👥 مستخدمون (فريد): <b>${stats.totalUsers}</b>`,
    `🆕 جدد (7 أيام): <b>${stats.newUsers7d}</b>`,
    `🔗 روابط مُرسلة: <b>${stats.totalLinks}</b>`,
    `✅ نجاح: <b>${stats.successLinks}</b> | ❌ فشل: <b>${stats.failedLinks}</b>`,
    `🎁 إحالات مسجّلة: <b>${stats.referrals}</b>`,
    '',
    '<b>أكثر المنصات:</b>',
  ]

  if (stats.topPlatforms.length === 0) {
    lines.push('— لا بيانات بعد')
  } else {
    for (const p of stats.topPlatforms) {
      lines.push(`• ${p.platform}: ${p.count}`)
    }
  }

  lines.push('', '<b>أكثر المستخدمين (روابط):</b>')
  if (stats.topUsers.length === 0) {
    lines.push('— لا بيانات بعد')
  } else {
    for (const u of stats.topUsers) {
      const name = u.username
        ? `@${u.username}`
        : u.firstName || String(u.telegramId)
      lines.push(`• ${name} (<code>${u.telegramId}</code>): ${u.count}`)
    }
  }

  return lines.join('\n')
}
