import { join } from 'path'
import { collectImageUrlsFromInfo } from '@/helpers/extractImageUrlsFromInfo'
import { resolveDownloadedMediaPath } from '@/helpers/resolveDownloadedFile'
import env from '@/helpers/env'
import logger from '@/lib/logger'
import { extractAlbumImageUrls } from '@/services/albumExtract'
import { buildDownloadFlags, buildProbeFlags, SOCIAL_IMAGE_FORMAT } from '@/services/ytdlpOptions'
import { runYtdlpDownload, runYtdlpJson } from '@/services/ytdlpRunner'
import type { YtDlpMetadata } from '@/services/ytdlpTypes'

const PROBE_MS = Math.min(env.YTDLP_PROBE_TIMEOUT_MS, 60_000)

/** yt-dlp carousel URLs when embed scrape fails on datacenter IPs. */
export async function probeYtdlpInstagramCarousel(
  postUrl: string
): Promise<string[]> {
  try {
    const meta = (await runYtdlpJson(
      postUrl,
      {
        ...buildProbeFlags(postUrl),
        flatPlaylist: true,
        skipDownload: true,
        ignoreNoFormatsError: true,
      },
      PROBE_MS,
      'ig-ytdlp-flat'
    )) as YtDlpMetadata

    const entryUrls: string[] = []
    for (const entry of meta.entries || []) {
      const row = entry as YtDlpMetadata & { webpage_url?: string; url?: string }
      const u = row.webpage_url || row.url || ''
      if (/\/p\//i.test(u)) {
        entryUrls.push(u.split('?')[0])
      }
    }
    if (entryUrls.length > 1) {
      return [...new Set(entryUrls)]
    }

    const fromFormats = extractAlbumImageUrls(meta)
    if (fromFormats.length > 1) {
      return fromFormats
    }

    const fromCollect = await collectImageUrlsFromInfo(meta, postUrl)
    return fromCollect
  } catch (error) {
    logger.warn('ig ytdlp carousel probe failed', {
      url: postUrl,
      detail: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/** Download each carousel slide via yt-dlp (per-entry or multi-format metadata). */
export async function downloadYtdlpInstagramCarousel(
  postUrl: string,
  jobDir: string
): Promise<string[]> {
  const entryUrls = await probeYtdlpInstagramCarousel(postUrl)

  if (entryUrls.length > 1 && entryUrls[0].includes('/p/')) {
    const paths: string[] = []
    const limit = Math.min(entryUrls.length, env.ALBUM_MAX_IMAGES)
    for (let i = 0; i < limit; i++) {
      const base = `ytdlp${i + 1}`
      try {
        await runYtdlpDownload(
          entryUrls[i],
          {
            ...buildDownloadFlags(join(jobDir, base), false, {
              imageMode: true,
              sourceUrl: postUrl,
            }),
            format: SOCIAL_IMAGE_FORMAT,
            writeInfoJson: false,
            noPlaylist: true,
          },
          env.DOWNLOAD_TIMEOUT_MS,
          `ig-ytdlp-slide-${i + 1}`
        )
        paths.push(await resolveDownloadedMediaPath(jobDir, base, true))
      } catch (error) {
        logger.warn('ig ytdlp entry skip', {
          index: i,
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (paths.length > 1) {
      logger.info('ig ytdlp carousel entries ok', {
        postUrl,
        count: paths.length,
      })
      return paths
    }
  }

  const cdnUrls = entryUrls.filter((u) => /cdninstagram|fbcdn/i.test(u))
  if (cdnUrls.length > 1) {
    const { fetchInstagramSlidesToDir } = await import('@/helpers/instagramCdnFetch')
    return fetchInstagramSlidesToDir(cdnUrls, postUrl, jobDir)
  }

  const outputBase = join(jobDir, 'carousel')
  await runYtdlpDownload(
    postUrl,
    {
      ...buildDownloadFlags(outputBase, false, {
        imageMode: true,
        sourceUrl: postUrl,
      }),
      format: SOCIAL_IMAGE_FORMAT,
      writeInfoJson: true,
      output: `${outputBase}.%(playlist_index)02d.%(ext)s`,
    },
    env.DOWNLOAD_TIMEOUT_MS,
    'ig-ytdlp-carousel'
  )

  const { readdir, readFile } = await import('fs/promises')
  const names = (await readdir(jobDir))
    .filter((n) => /\.(jpe?g|webp|png)$/i.test(n) && !n.endsWith('.info.json'))
    .sort()
  if (names.length > 1) {
    return names.map((n) => join(jobDir, n))
  }

  for (const name of await readdir(jobDir)) {
    if (!name.endsWith('.info.json')) {
      continue
    }
    try {
      const meta = JSON.parse(
        await readFile(join(jobDir, name), 'utf8')
      ) as YtDlpMetadata
      const urls = await collectImageUrlsFromInfo(meta, postUrl)
      if (urls.length > 1) {
        const { fetchInstagramSlidesToDir } = await import('@/helpers/instagramCdnFetch')
        return fetchInstagramSlidesToDir(urls, postUrl, jobDir)
      }
    } catch {
      // skip
    }
  }

  if (names.length === 1) {
    return [join(jobDir, names[0])]
  }
  return []
}
