import { createWriteStream } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { InputFile } from 'grammy'
import bot from '@/helpers/bot'
import { mirrorFileToAdmin } from '@/helpers/adminMirror'
import { pipeZipArchive } from '@/helpers/createZipArchive'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import Context from '@/models/Context'

const MAX_FILES = 10
const COLLECT_MS = 1_500

interface BatchState {
  paths: string[]
  jobDir: string
  timer: ReturnType<typeof setTimeout> | undefined
  ctx: Context
  pending: number
  finishing: boolean
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
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) })
  if (!res.ok) {
    throw new Error(`fetch photo ${res.status}`)
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

function scheduleFinish(key: string): void {
  const state = batches.get(key)
  if (!state || state.finishing) {
    return
  }
  if (state.timer) {
    clearTimeout(state.timer)
  }
  state.timer = setTimeout(() => {
    void tryFinishBatch(key)
  }, COLLECT_MS)
}

async function tryFinishBatch(key: string): Promise<void> {
  const state = batches.get(key)
  if (!state || state.finishing || state.pending > 0) {
    if (state && !state.finishing && state.pending > 0) {
      scheduleFinish(key)
    }
    return
  }
  await finishBatch(key)
}

async function finishBatch(key: string): Promise<void> {
  const state = batches.get(key)
  if (!state || state.finishing) {
    return
  }
  state.finishing = true
  batches.delete(key)

  const { paths, ctx, jobDir } = state
  if (paths.length === 0) {
    await removePathSafe(jobDir)
    return
  }

  try {
    const status = await ctx.reply(ctx.i18n.t('zip_building'))
    const zipPath = join(jobDir, 'photos.zip')
    await pipeZipArchive(createWriteStream(zipPath), (archive) => {
      paths.forEach((p, i) => {
        archive.file(p, { name: `photo_${i + 1}.jpg` })
      })
    })

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

/** Collect up to 10 photos in a media group → ZIP. */
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
      timer: undefined,
      ctx,
      pending: 0,
      finishing: false,
    }
    batches.set(key, state)
  }

  if (state.finishing || state.paths.length >= MAX_FILES) {
    return
  }

  const index = state.paths.length
  const dest = join(state.jobDir, `p${index + 1}.jpg`)
  state.pending++

  if (index === 0) {
    void ctx.reply(ctx.i18n.t('zip_collecting', { max: String(MAX_FILES) }))
  }

  try {
    await downloadPhoto(largest.file_id, dest)
    if (!state.finishing) {
      state.paths.push(dest)
    }
  } catch (error) {
    logger.warn('zip photo skip', {
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    state.pending--
    scheduleFinish(key)
  }
}
