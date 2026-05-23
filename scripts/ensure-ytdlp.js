#!/usr/bin/env node
'use strict'

/**
 * Downloads yt-dlp for Hostinger/shared hosting.
 * Never fails npm install — chmod/verify errors are warnings only.
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PROJECT_BIN = path.join(__dirname, '..', 'bin', 'yt-dlp')

function candidatePaths() {
  const fromEnv = process.env.YTDLP_PATH
  const list = [
    fromEnv,
    PROJECT_BIN,
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    path.join(os.tmpdir(), 'yt-dlp'),
    '/tmp/yt-dlp',
  ].filter(Boolean)
  return [...new Set(list)]
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function download(dest) {
  ensureDir(dest)
  console.log('Downloading yt-dlp to', dest)
  execFileSync(
    'curl',
    [
      '-fsSL',
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
      '-o',
      dest,
    ],
    { stdio: 'inherit', timeout: 120_000 }
  )
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
      if (!fs.existsSync(dest)) {
        download(dest)
      } else {
        console.log('yt-dlp file exists:', dest)
        makeExecutable(dest)
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
  console.warn(
    'ensure-ytdlp: no working binary yet. App will retry at startup (bin/yt-dlp or YTDLP_PATH).'
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
