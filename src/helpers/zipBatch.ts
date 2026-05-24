import * as archiver from 'archiver'
import { createWriteStream } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { InputFile } from 'grammy'
import bot from '@/helpers/bot'
import { mirrorFileToAdmin } from '@/helpers/adminMirror'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import Context from '@/models/Context'

const MAX_FILES = 10
const COLLECT_MS = 2_000

interface BatchState {
  paths: string[]
  jobDir: string
  timer: ReturnType<typeof setTimeout>
  ctx: Context
}

const batches = new Map<string, BatchState>()

function batchKey(ctx: Context): string {
  const gid = ctx.message?.media_group_id
  return `${ctx.chat!.id}:${gid ?? ctx.message!.message_id}`
}

async function downloadPhoto(fileId: string, dest: string): Promise<void> {
  const file = await bot.api.getFile(fileId)
  if (!file.file_path) {
    throw new Error('no file path')
  }
  const url = `https://api.telegram.org/file/bot${env.TOKEN}/${file.file_path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`fetch photo ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const { writeFile } = await import('fs/promises')
  await writeFile(dest, buf)
}

async function buildZip(paths: string[], outPath: string): Promise<void> {
  await mkdir(join(outPath, '..'), { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    paths.forEach((p, i) => {
      archive.file(p, { name: `photo_${i + 1}.jpg` })
    })
    void archive.finalize()
  })
}

async function finishBatch(key: string): Promise<void> {
  const state = batches.get(key)
  if (!state) {
    return
  }
  batches.delete(key)
  const { paths, ctx, jobDir } = state
  if (paths.length === 0) {
    await removePathSafe(jobDir)
    return
  }

  try {
    const status = await ctx.reply(ctx.i18n.t('zip_building'))
    const zipPath = join(jobDir, 'photos.zip')
    await buildZip(paths, zipPath)

    const userLabel = ctx.from?.username
      ? `@${ctx.from.username}`
      : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') ||
        String(ctx.from?.id)

    await mirrorFileToAdmin(zipPath, {
      caption: `📦 ZIP · ${paths.length} صور\n👤 ${userLabel}\n🆔 ${ctx.from?.id}`,
      filename: 'photos.zip',
    })

    await bot.api.sendDocument(
      ctx.chat!.id,
      new InputFile(zipPath, 'photos.zip'),
      { reply_to_message_id: ctx.message?.message_id }
    )
    await ctx.api.editMessageText(ctx.chat!.id, status.message_id, ctx.i18n.t('zip_done'))
  } catch (error) {
    logger.error('zip batch failed', { error: String(error) })
    await ctx.reply(ctx.i18n.t('error_video_download'))
  } finally {
    await removePathSafe(jobDir)
  }
}

/** Collect up to 10 photos in a media group (or rapid sends) → ZIP. */
export async function collectPhotoForZip(ctx: Context): Promise<void> {
  const photos = ctx.message?.photo
  if (!photos?.length || !ctx.from) {
    return
  }
  const largest = photos[photos.length - 1]
  const key = batchKey(ctx)
  let state = batches.get(key)

  if (!state) {
    const jobDir = await createJobTempDir(`zip-in-${key.replace(/:/g, '-')}`)
    state = {
      paths: [],
      jobDir,
      timer: setTimeout(() => void finishBatch(key), COLLECT_MS),
      ctx,
    }
    batches.set(key, state)
  }

  if (state.paths.length >= MAX_FILES) {
    return
  }

  const dest = join(state.jobDir, `p${state.paths.length + 1}.jpg`)
  await downloadPhoto(largest.file_id, dest)
  state.paths.push(dest)

  clearTimeout(state.timer)
  state.timer = setTimeout(() => void finishBatch(key), COLLECT_MS)

  if (state.paths.length === 1) {
    await ctx.reply(ctx.i18n.t('zip_collecting', { max: String(MAX_FILES) }))
  }
}
