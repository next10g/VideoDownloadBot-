import type { Archiver } from 'archiver'
import type { Writable } from 'stream'

// CJS default export — `import * as archiver` breaks on Hostinger (archiver is not a function).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverLib = require('archiver') as
  | ((format: string, options?: object) => Archiver)
  | { default: (format: string, options?: object) => Archiver }

function createArchiver(format: string, options?: object): Archiver {
  if (typeof archiverLib === 'function') {
    return archiverLib(format, options)
  }
  return archiverLib.default(format, options)
}

export function pipeZipArchive(
  output: Writable,
  onFile: (archive: Archiver) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = createArchiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    onFile(archive)
    void archive.finalize()
  })
}
