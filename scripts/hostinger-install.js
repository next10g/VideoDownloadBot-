#!/usr/bin/env node
'use strict'

/**
 * Hostinger install: npm only (avoids Yarn 4 --non-interactive deprecation on CI).
 * hPanel Install command: node scripts/hostinger-install.js
 * SSH: /opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js
 */

const { spawnSync } = require('child_process')
const fs = require('fs')

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
    '/opt/alt/alt-nodejs22/root/usr/bin',
    '/opt/alt/alt-nodejs20/root/usr/bin',
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

if (!run(npmBin, ['install'])) {
  console.log('npm install failed — retrying with --ignore-scripts')
  if (!run(npmBin, ['install', '--ignore-scripts'])) {
    process.exit(1)
  }
}

if (!run(nodeBin, ['scripts/ensure-ytdlp.js'])) {
  process.exit(1)
}

console.log('Install completed (npm).')
