import Context from '@/models/Context'
import offerDownloadFormats from '@/helpers/offerDownloadFormats'
import report from '@/helpers/report'
import { extractFirstUrl } from '@/services/urlNormalize'

export default function handleUrl(ctx: Context) {
  try {
    const text = ctx.message?.text
    if (!text) {
      return ctx.replyWithLocalization('error_invalid_url')
    }
    const url = extractFirstUrl(text)
    if (!url) {
      return ctx.replyWithLocalization('error_invalid_url')
    }
    return offerDownloadFormats(ctx, url)
  } catch (error) {
    report(error, { ctx, location: 'handleUrl' })
    return ctx.replyWithLocalization('error_cannot_start_download')
  }
}
