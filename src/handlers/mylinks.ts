import { listUserLinks } from '@/helpers/userLibrary'
import { formatBytesGb } from '@/helpers/userDownloadStats'
import Context from '@/models/Context'

export default async function handleMyLinks(ctx: Context) {
  const links = await listUserLinks(ctx.dbchat.telegramId, 20)
  if (links.length === 0) {
    return ctx.reply(ctx.i18n.t('mylinks_empty'))
  }

  const lines = [ctx.i18n.t('mylinks_header'), '']
  for (const link of links) {
    const size =
      link.bytes > 0 ? formatBytesGb(link.bytes) : '—'
    lines.push(
      `• ${link.platform} · ${link.downloadMode} · ${size}`,
      `  ${link.title || '—'}`,
      `  ${link.url.slice(0, 90)}`
    )
  }
  return ctx.reply(lines.join('\n'))
}
