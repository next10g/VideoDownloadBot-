import Context from '@/models/Context'
import { applyReferralFromStart } from '@/helpers/syncChatProfile'
import { buildStartKeyboard, buildWelcomeText } from '@/helpers/startMenu'

export default async function handleStart(ctx: Context) {
  const payload =
    typeof ctx.match === 'string'
      ? ctx.match
      : Array.isArray(ctx.match)
        ? ctx.match[0]
        : undefined

  await applyReferralFromStart(ctx, payload)

  const text = await buildWelcomeText(ctx)
  return ctx.reply(text, {
    reply_markup: buildStartKeyboard(ctx),
    parse_mode: 'HTML',
  })
}
