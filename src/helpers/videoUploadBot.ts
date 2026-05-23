import { Agent as HttpsAgent } from 'https'
import { Bot } from 'grammy'
import Context from '@/models/Context'
import env from '@/helpers/env'

/** Long-lived HTTPS agent for large uploads on slow/shared hosting. */
const uploadAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 60_000,
  timeout: 0,
  maxSockets: 4,
})

const videoUploadBot = new Bot<Context>(env.TOKEN, {
  ContextConstructor: Context,
  client: {
    apiRoot: env.BOT_API_URL,
    baseFetchConfig: {
      compress: false,
      agent: uploadAgent,
      timeout: env.UPLOAD_TIMEOUT_MS,
    },
  },
})

export default videoUploadBot
