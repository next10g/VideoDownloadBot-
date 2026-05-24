import { isBotAdmin } from '@/helpers/isBotAdmin'
import Context from '@/models/Context'

export default function handleHelp(ctx: Context) {
  const parts = [ctx.i18n.t('help')]
  if (isBotAdmin(ctx)) {
    parts.push('', ctx.i18n.t('help_admin'))
  }
  return ctx.reply(parts.join('\n'), { parse_mode: 'HTML' })
}
