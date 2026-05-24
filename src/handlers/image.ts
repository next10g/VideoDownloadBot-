import Context from '@/models/Context'

export default async function handleImage(ctx: Context) {
  ctx.dbchat.imagePreferred = !ctx.dbchat.imagePreferred
  if (ctx.dbchat.imagePreferred) {
    ctx.dbchat.audio = false
  }
  await ctx.dbchat.save()
  return ctx.replyWithLocalization(
    ctx.dbchat.imagePreferred ? 'image_on' : 'image_off'
  )
}
