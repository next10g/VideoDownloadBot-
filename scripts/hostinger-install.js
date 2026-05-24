#!/usr/bin/env node
'use strict'

/**
 * Hostinger install: npm only (avoids Yarn 4 --non-interactive deprecation on CI).
 * hPanel Install command: node scripts/hostinger-install.js
 * SSH: /opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/** Hostinger breaks when NODE_OPTIONS contains dns-result-order (invalid or uppercased). */
function buildEnv(extraPath) {
  const env = { ...process.env, YOUTUBE_DL_SKIP_PYTHON_CHECK: '1' }
  let opts = (env.NODE_OPTIONS || '').trim()
  opts = opts
    .replace(/--dns-result-order(=\S*)?/gi, '')
    .replace(/--DNS-RESULT-ORDER(=\S*)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (opts) {
    env.NODE_OPTIONS = opts
  } else {
    delete env.NODE_OPTIONS
  }
  if (extraPath) {
    env.PATH = `${extraPath}:${env.PATH || ''}`
  }
  return env
}

function findHostingerTool(name) {
  const fromEnv = process.env.YTDLP_NODE_PATH
  if (name === 'node' && fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv
  }
  const dirs = [
    '/opt/alt/alt-nodejs20/root/usr/bin',
    '/opt/alt/alt-nodejs22/root/usr/bin',
    '/opt/alt/alt-nodejs18/root/usr/bin',
  ]
  for (const dir of dirs) {
    const full = `${dir}/${name}`
    if (fs.existsSync(full)) {
      return full
    }
  }
  return name
}

const nodeBin = findHostingerTool('node')
const npmBin = findHostingerTool('npm')
const toolDir = nodeBin.includes('/') ? nodeBin.replace(/\/[^/]+$/, '') : ''
const env = buildEnv(toolDir)

console.log('Using node:', nodeBin)
console.log('Using npm:', npmBin)

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
  return result.status === 0
}

if (!run(npmBin, ['install', '--include=optional'])) {
  console.log('npm install failed — retrying with --ignore-scripts')
  if (!run(npmBin, ['install', '--ignore-scripts'])) {
    process.exit(1)
  }
}

if (!run(npmBin, ['rebuild', 'sharp'])) {
  console.warn('sharp rebuild failed — Instagram photos will use ffmpeg instead')
}

if (!run(nodeBin, ['scripts/ensure-ytdlp.js'])) {
  process.exit(1)
}

const galleryDlBin = path.join(process.cwd(), 'bin', 'gallery-dl')
if (process.platform === 'linux' && !fs.existsSync(galleryDlBin)) {
  const pipCandidates = [
    '/opt/alt/alt-python311/bin/pip3.11',
    '/opt/alt/alt-python310/bin/pip3.10',
    'pip3',
  ]
  for (const pip of pipCandidates) {
    if (pip.includes('/') && !fs.existsSync(pip)) {
      continue
    }
    console.log('Trying gallery-dl install via', pip)
    if (
      run(pip, [
        'install',
        '--target',
        path.join(process.cwd(), 'bin', 'gallery-dl-lib'),
        'gallery-dl',
      ])
    ) {
      break
    }
  }
  const gdlScript = path.join(process.cwd(), 'bin', 'gallery-dl-lib', 'bin', 'gallery-dl')
  if (fs.existsSync(gdlScript)) {
    try {
      fs.symlinkSync(gdlScript, galleryDlBin)
      console.log('gallery-dl linked to bin/gallery-dl')
    } catch {
      console.warn('Could not symlink gallery-dl — set GALLERY_DL_PATH manually')
    }
  }
}

const ffmpegBin = path.join(process.cwd(), 'bin', 'ffmpeg')
if (process.platform === 'linux' && !fs.existsSync(ffmpegBin)) {
  const ffScript = path.join(__dirname, 'install-ffmpeg.sh')
  if (fs.existsSync(ffScript)) {
    console.log('bin/ffmpeg missing — trying static ffmpeg install...')
    run('bash', [ffScript])
  }
}

const buildScript = path.join(__dirname, 'hostinger-build.js')
if (fs.existsSync(buildScript)) {
  if (!run(nodeBin, [buildScript])) {
    console.warn('TypeScript build failed — upload dist/ from your PC or run:')
    console.warn(`  ${nodeBin} scripts/hostinger-build.js`)
  }
} else {
  console.warn('hostinger-build.js missing — run build-ts locally and upload dist/')
}

console.log('Install completed (npm).')
