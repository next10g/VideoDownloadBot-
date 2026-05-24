import Context from '@/models/Context'

/** Save phone when user shares contact (Telegram does not expose it otherwise). */
export default async function handleContact(ctx: Context) {
  const contact = ctx.message?.contact
  if (!contact?.phone_number || !ctx.from) {
    return
  }
  if (contact.user_id && contact.user_id !== ctx.from.id) {
    return ctx.reply(ctx.i18n.t('contact_own_only'))
  }
  ctx.dbchat.phoneNumber = contact.phone_number
  await ctx.dbchat.save()
  return ctx.reply(ctx.i18n.t('contact_saved'))
}
