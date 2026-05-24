import * as dotenv from 'dotenv'
import { bool, cleanEnv, makeValidator, num, str } from 'envalid'
import { normalizeApiUrlList } from '@/helpers/normalizeApiUrl'
import { cwd } from 'process'
import { resolve } from 'path'

dotenv.config({ path: resolve(cwd(), '.env') })

const commaList = makeValidator<string[]>((input) => {
  if (!input || input.trim() === '') {
    return []
  }
  return normalizeApiUrlList(input.split(','))
})

// eslint-disable-next-line node/no-process-env
const env = cleanEnv(process.env, {
  TOKEN: str(),
  MONGO: str(),
  ADMIN_ID: num(),
  BOT_API_URL: str({ default: 'https://api.telegram.org' }),
  ENVIRONMENT: str({
    choices: ['development', 'production'],
    default: 'production',
  }),
  WEBHOOK_URL: str({ desc: 'Public base URL, e.g. https://bot.example.com' }),
  WEBHOOK_SECRET: str({ desc: 'Secret token for Telegram webhook' }),
  PORT: num({ default: 3000 }),
  USER_COOLDOWN_SECONDS: num({
    default: 0,
    desc: '0 = no wait between links',
  }),
  DOWNLOAD_TIMEOUT_MS: num({ default: 900_000 }),
  UPLOAD_TIMEOUT_MS: num({
    default: 900_000,
    desc: 'Per-attempt timeout for Telegram file upload (large files on shared hosting)',
  }),
  UPLOAD_MAX_RETRIES: num({ default: 5 }),
  YTDLP_PROBE_TIMEOUT_MS: num({
    default: 45_000,
    desc: 'yt-dlp metadata probe max wait (lower = faster bot replies)',
  }),
  QUEUE_JOB_TIMEOUT_MS: num({ default: 1_200_000 }),
  QUEUE_MAX_RETRIES: num({ default: 1 }),
  MAX_FILE_SIZE_MB: num({ default: 500 }),
  MAX_DURATION_SECONDS: num({ default: 7_200 }),
  MAX_USER_ACTIVE_JOBS: num({ default: 1 }),
  UPLOAD_RETRY_BASE_MS: num({ default: 2_000 }),
  LOW_MEMORY_MODE: str({ choices: ['auto', 'on', 'off'], default: 'auto' }),
  LOW_MEMORY_THRESHOLD_MB: num({ default: 200 }),
  TEMP_CLEANUP_INTERVAL_MS: num({ default: 300_000 }),
  TEMP_MAX_AGE_MS: num({ default: 3_600_000 }),
  DISALLOWED_EXTRACTORS: commaList({ default: [] }),
  SUSPICIOUS_EXTRACTORS: commaList({ default: [] }),
  BLACKLIST_DOMAINS: commaList({ default: [] }),
  SKIP_THUMBNAILS: bool({ default: false }),
  AVG_JOB_DURATION_SECONDS: num({ default: 120 }),
  USER_FAILURE_BLOCK_THRESHOLD: num({ default: 5 }),
  USER_BLOCK_MINUTES: num({ default: 30 }),
  REQUIRED_CHANNEL_ENABLED: bool({ default: false }),
  REQUIRED_CHANNEL: str({ default: '' }),
  REQUIRED_CHANNEL_LINK: str({ default: '' }),
  YTDLP_PATH: str({ default: '' }),
  FFMPEG_PATH: str({ default: '' }),
  YOUTUBE_BACKEND: str({
    choices: ['piped', 'ytdlp', 'auto'],
    default: 'auto',
    desc: 'piped = Piped+Invidious. auto = + yt-dlp fallback. ytdlp = direct only',
  }),
  PIPED_API_URLS: commaList({
    default: [],
    desc: 'Optional Piped API bases (comma-separated). Empty = built-in list',
  }),
  INVIDIOUS_API_URLS: commaList({
    default: [],
    desc: 'Optional Invidious API bases (comma-separated). Empty = built-in list',
  }),
  PIPED_API_TIMEOUT_MS: num({ default: 45_000 }),
  YOUTUBE_MAX_HEIGHT: num({
    default: 15360,
    desc: 'Max video height cap (up to 16K when source provides it)',
  }),
  YOUTUBE_DISABLED: bool({
    default: true,
    desc: 'Reject YouTube links with a friendly message (Hostinger IP blocks)',
  }),
  ALBUM_MAX_IMAGES: num({
    default: 40,
    desc: 'Max images in one carousel/album ZIP download',
  }),
  SHOW_FORMAT_MENU: bool({
    default: true,
    desc: 'Show quality/type buttons before each download',
  }),
  REFERRAL_ENABLED: bool({
    default: true,
    desc: 'Enable /refer and invite links',
  }),
  YOUTUBE_USE_COOKIES: bool({
    default: false,
    desc: 'yt-dlp only: try admin cookies (not for public bots)',
  }),
  YOUTUBE_FALLBACK_COOKIES: bool({
    default: false,
    desc: 'yt-dlp only: retry with cookies.txt after anonymous clients fail',
  }),
  YOUTUBE_COOKIES_FIRST: bool({
    default: false,
    desc: 'yt-dlp only: try cookies before anonymous clients',
  }),
  YOUTUBE_COOKIE_POOL_DIR: str({
    default: '',
    desc: 'Directory of cookies-pool/*.txt when YOUTUBE_USE_COOKIES=true (rotates per job)',
  }),
  YOUTUBE_USER_COOLDOWN_SECONDS: num({
    default: 20,
    desc: 'Per-user wait between YouTube links (reduces IP blocks on shared hosting)',
  }),
  YTDLP_YOUTUBE_PO_TOKEN: str({
    default: '',
    desc: 'Optional PO token(s), e.g. android_vr.gvs+TOKEN (see yt-dlp PO Token Guide)',
  }),
  COOKIES_PATH: str({
    default: '',
    desc: 'Single cookies file when YOUTUBE_USE_COOKIES=true',
  }),
  YTDLP_NODE_PATH: str({
    default: '',
    desc: 'Node binary for yt-dlp YouTube JS (defaults to process running the bot)',
  }),
  SKIP_YTDLP_PROBE: bool({ default: false }),
  SOFT_YTDLP_PROBE: bool({
    default: true,
    desc: 'If probe fails, continue to download anyway (recommended on shared hosting)',
  }),
})

const envApi = {
  ...env,
  get MONGO() {
    return env.MONGO.trim()
  },
  get WEBHOOK_URL() {
    return env.WEBHOOK_URL.trim().replace(/\/$/, '')
  },
  get YTDLP_PATH_RESOLVED() {
    const custom = env.YTDLP_PATH.trim()
    return custom || undefined
  },
  get FFMPEG_PATH_RESOLVED() {
    const custom = env.FFMPEG_PATH.trim()
    return custom || undefined
  },
  get COOKIES_PATH_RESOLVED() {
    const custom = env.COOKIES_PATH.trim()
    return custom || undefined
  },
  get YOUTUBE_COOKIE_POOL_DIR_RESOLVED() {
    const custom = env.YOUTUBE_COOKIE_POOL_DIR.trim()
    return custom || undefined
  },
  get YOUTUBE_USER_COOLDOWN_MS() {
    return env.YOUTUBE_USER_COOLDOWN_SECONDS * 1000
  },
  get YTDLP_NODE_PATH_RESOLVED() {
    const custom = env.YTDLP_NODE_PATH.trim()
    return custom || undefined
  },
  get isDevelopment() {
    return env.ENVIRONMENT === 'development'
  },
  get USER_COOLDOWN_MS() {
    return env.USER_COOLDOWN_SECONDS * 1000
  },
  get MAX_FILE_SIZE_BYTES() {
    return env.MAX_FILE_SIZE_MB * 1024 * 1024
  },
  get LOW_MEMORY_THRESHOLD_BYTES() {
    return env.LOW_MEMORY_THRESHOLD_MB * 1024 * 1024
  },
  get YTDLP_MATCH_FILTER() {
    return `!is_live & duration <= ${env.MAX_DURATION_SECONDS}`
  },
}

export type Env = typeof envApi
export default envApi
