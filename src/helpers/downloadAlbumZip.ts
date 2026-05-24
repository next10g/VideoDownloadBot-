import { createWriteStream } from 'fs'
import { join } from 'path'
import { fetchImageToFile } from '@/helpers/fetchImageToFile'
import { pipeZipArchive } from '@/helpers/createZipArchive'
import { createJobTempDir, removePathSafe } from '@/helpers/tempDir'
import env from '@/helpers/env'
import logger from '@/lib/logger'

/** Download carousel images → single ZIP on disk. */
export async function downloadAlbumAsZip(
  urls: string[],
  jobId: string
): Promise<string> {
  const jobDir = await createJobTempDir(`alb-${jobId}`)
  const paths: string[] = []
  const limited = urls.slice(0, env.ALBUM_MAX_IMAGES)

  for (let i = 0; i < limited.length; i++) {
    const dest = join(jobDir, `img${i + 1}.jpg`)
    try {
      await fetchImageToFile(limited[i], dest)
      paths.push(dest)
    } catch (error) {
      logger.warn('album image skip', {
        index: i,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (paths.length === 0) {
    await removePathSafe(jobDir)
    throw new Error('No album images downloaded')
  }

  const zipPath = join(jobDir, 'album.zip')
  await pipeZipArchive(createWriteStream(zipPath), (archive) => {
    paths.forEach((p, i) => {
      archive.file(p, { name: `image_${i + 1}.jpg` })
    })
  })
  return zipPath
}
