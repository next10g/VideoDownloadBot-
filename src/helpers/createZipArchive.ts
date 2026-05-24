import type { Archiver } from 'archiver'
import type { Writable } from 'stream'

// archiver@8 is ESM: require() exposes { ZipArchive } (no default factory).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverMod = require('archiver') as {
  ZipArchive?: new (options?: { zlib?: { level?: number } }) => Archiver
  default?: (format: string, options?: object) => Archiver
}

function createArchiver(): Archiver {
  if (archiverMod.ZipArchive) {
    return new archiverMod.ZipArchive({ zlib: { level: 6 } })
  }
  if (typeof archiverMod === 'function') {
    return (archiverMod as (format: string, options?: object) => Archiver)(
      'zip',
      { zlib: { level: 6 } }
    )
  }
  if (typeof archiverMod.default === 'function') {
    return archiverMod.default('zip', { zlib: { level: 6 } })
  }
  throw new Error('archiver ZipArchive is not available')
}

export function pipeZipArchive(
  output: Writable,
  onFile: (archive: Archiver) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = createArchiver()
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    onFile(archive)
    void archive.finalize()
  })
}
