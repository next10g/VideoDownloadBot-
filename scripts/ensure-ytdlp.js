#!/usr/bin/env node
'use strict'

/**
 * Downloads yt-dlp when youtube-dl-exec postinstall did not run
 * (Hostinger / shared hosting without Python during npm install).
 */

const { chmod, mkdir, writeFile } = require('fs/promises')
const { createWriteStream } = require('fs')
const { pipeline } = require('stream/promises')
const { Readable } = require('stream')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const IS_WIN = process.platform === 'win32'
const FILENAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'

function resolveTargetPath() {
  try {
    const constants = require('youtube-dl-exec/src/constants')
    return constants.YOUTUBE_DL_PATH
  } catch {
    return path.join(ROOT, 'bin', FILENAME)
  }
}

async function downloadFromGitHub(destPath) {
  const apiUrl =
    process.env.YOUTUBE_DL_HOST ||
    'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'

  const headers = { 'User-Agent': 'video-download-bot-install' }
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}`
  }

  const release = await fetch(apiUrl, { headers })
  if (!release.ok) {
    throw new Error(`GitHub API error: ${release.status}`)
  }
  const json = await release.json()
  const assetName = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'
  const asset = json.assets?.find((a) => a.name === assetName)
  if (!asset?.browser_download_url) {
    throw new Error(`Release asset ${assetName} not found`)
  }

  console.log(`Downloading yt-dlp from ${asset.browser_download_url}`)
  const binRes = await fetch(asset.browser_download_url, { headers })
  if (!binRes.ok || !binRes.body) {
    throw new Error(`Download failed: ${binRes.status}`)
  }

  await mkdir(path.dirname(destPath), { recursive: true })
  const nodeStream = Readable.fromWeb(binRes.body)
  await pipeline(nodeStream, createWriteStream(destPath))
  await chmod(destPath, 0o755)
}

async function main() {
  const destPath = resolveTargetPath()
  if (fs.existsSync(destPath)) {
    console.log('yt-dlp already installed:', destPath)
    return
  }

  try {
    process.env.YOUTUBE_DL_SKIP_PYTHON_CHECK = '1'
    require('youtube-dl-exec/scripts/postinstall.js')
    await new Promise((r) => setTimeout(r, 3000))
    if (fs.existsSync(destPath)) {
      console.log('yt-dlp installed via youtube-dl-exec:', destPath)
      return
    }
  } catch (error) {
    console.warn('youtube-dl-exec postinstall failed:', error.message)
  }

  await downloadFromGitHub(destPath)
  console.log('yt-dlp installed:', destPath)
}

main().catch((error) => {
  console.error('ensure-ytdlp failed:', error)
  process.exit(1)
})
