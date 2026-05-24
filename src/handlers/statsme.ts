import { formatBytesGb } from '@/helpers/userDownloadStats'
import Context from '@/models/Context'

export default async function handleStatsMe(ctx: Context) {
  const chat = ctx.dbchat
  const counts = chat.fileTypeCounts ?? {}
  const typeLines = Object.entries(counts)
    .map(([k, v]) => `  · ${k}: ${v}`)
    .join('\n')

  return ctx.reply(
    ctx.i18n.t('statsme_body', {
      files: String(chat.successDownloadCount ?? 0),
      size: formatBytesGb(chat.totalBytesDownloaded ?? 0),
      links: String(chat.linkCount ?? 0),
      types: typeLines || '  · —',
    })
  )
}
