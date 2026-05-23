#!/usr/bin/env node
'use strict'

/**
 * Downloads standalone yt-dlp (yt-dlp_linux on Linux — no host Python needed).
 * Never fails npm install.
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PROJECT_BIN = path.join(__dirname, '..', 'bin', 'yt-dlp')

function releaseAsset() {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

function downloadUrl() {
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${releaseAsset()}`
}

function candidatePaths() {
  const fromEnv = process.env.YTDLP_PATH
  const list = [
    PROJECT_BIN,
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    fromEnv,
    path.join(os.tmpdir(), 'yt-dlp'),
    '/tmp/yt-dlp',
  ].filter(Boolean)
  return [...new Set(list)]
}

function prepareDest(dest) {
  if (!fs.existsSync(dest)) {
    return
  }
  const st = fs.statSync(dest)
  if (st.isDirectory()) {
    console.log('Removing wrong yt-dlp directory (need a single binary file):', dest)
    fs.rmSync(dest, { recursive: true, force: true })
    return
  }
  if (!canExecute(dest)) {
    console.log('Removing broken yt-dlp file:', dest)
    fs.unlinkSync(dest)
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function download(dest) {
  prepareDest(dest)
  ensureDir(dest)
  const url = downloadUrl()
  console.log('Downloading', releaseAsset(), 'to', dest)
  execFileSync('curl', ['-fsSL', url, '-o', dest], {
    stdio: 'inherit',
    timeout: 120_000,
  })
}

function makeExecutable(dest) {
  try {
    fs.chmodSync(dest, 0o755)
  } catch (error) {
    console.warn('chmod failed (may be OK on some hosts):', error.message)
  }
}

function canExecute(dest) {
  try {
    if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) {
      return false
    }
    makeExecutable(dest)
    const version = execFileSync(dest, ['--version'], {
      encoding: 'utf8',
      timeout: 30_000,
    }).trim()
    console.log('yt-dlp OK at', dest, '—', version)
    return true
  } catch (error) {
    const code = error && error.code ? error.code : ''
    console.warn('Cannot execute yt-dlp at', dest, code, error.message)
    return false
  }
}

function tryYouTubeProbe(dest) {
  if (process.env.SKIP_YTDLP_POSTINSTALL_PROBE === '1') {
    return
  }
  try {
    execFileSync(
      dest,
      [
        '--dump-single-json',
        '--skip-download',
        '--no-playlist',
        '--force-ipv4',
        'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      ],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }
    )
    console.log('YouTube probe OK')
  } catch (error) {
    console.warn(
      'YouTube probe skipped/failed (install continues):',
      (error.stderr || error.message || '').toString().slice(0, 300)
    )
  }
}

function ensureYtdlp() {
  for (const dest of candidatePaths()) {
    try {
      prepareDest(dest)
      if (!fs.existsSync(dest)) {
        if (dest !== PROJECT_BIN && dest !== path.join(process.cwd(), 'bin', 'yt-dlp')) {
          continue
        }
        download(dest)
      } else if (!canExecute(dest)) {
        download(dest)
      } else {
        console.log('yt-dlp already OK:', dest)
      }
      if (canExecute(dest)) {
        tryYouTubeProbe(dest)
        console.log('ensure-ytdlp success:', dest)
        return dest
      }
    } catch (error) {
      console.warn('ensure-ytdlp path failed:', dest, error.message)
    }
  }

  try {
    download(PROJECT_BIN)
    if (canExecute(PROJECT_BIN)) {
      tryYouTubeProbe(PROJECT_BIN)
      console.log('ensure-ytdlp success:', PROJECT_BIN)
      return PROJECT_BIN
    }
  } catch (error) {
    console.warn('ensure-ytdlp download failed:', error.message)
  }

  console.warn(
    'ensure-ytdlp: no working binary yet. On SSH run: bash scripts/install-ytdlp.sh'
  )
  return null
}

try {
  ensureYtdlp()
  process.exit(0)
} catch (error) {
  console.warn('ensure-ytdlp warning (install continues):', error.message)
  process.exit(0)
}
