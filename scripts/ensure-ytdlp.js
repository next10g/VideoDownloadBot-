#!/usr/bin/env node
'use strict'

/**
 * Downloads yt-dlp to /tmp/yt-dlp (Hostinger-friendly) and verifies it runs.
 */

const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DEST = process.env.YTDLP_PATH || path.join(os.tmpdir(), 'yt-dlp')

function download(dest) {
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
  fs.chmodSync(dest, 0o755)
}

function verify(dest) {
  const version = execFileSync(dest, ['--version'], {
    encoding: 'utf8',
    timeout: 30_000,
  }).trim()
  console.log('yt-dlp version:', version)

  // Quick metadata probe (no download) — catches broken binaries on shared hosting
  const probe = spawnSync(
    dest,
    [
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--force-ipv4',
      '--extractor-args',
      'youtube:player_client=android',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    ],
    { encoding: 'utf8', timeout: 90_000 }
  )
  if (probe.status !== 0) {
    const err = (probe.stderr || probe.stdout || '').slice(0, 400)
    console.warn('YouTube probe warning (may still work for some URLs):', err)
  } else {
    console.log('YouTube probe OK')
  }
}

try {
  if (!fs.existsSync(DEST)) {
    download(DEST)
  } else {
    console.log('yt-dlp already exists:', DEST)
  }
  verify(DEST)
  console.log('ensure-ytdlp done:', DEST)
} catch (error) {
  console.error('ensure-ytdlp failed:', error.message)
  process.exit(1)
}
