#!/usr/bin/env node
'use strict'

/**
 * Install dependencies on Hostinger (no Python on PATH).
 * Usage: node scripts/hostinger-install.js
 * Or set Hostinger "Install command" to this script.
 */

const { spawnSync } = require('child_process')

const env = {
  ...process.env,
  YOUTUBE_DL_SKIP_PYTHON_CHECK: '1',
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
  return result.status === 0
}

if (!run('npm', ['install'])) {
  console.log('npm install failed — retrying with --ignore-scripts')
  if (!run('npm', ['install', '--ignore-scripts'])) {
    process.exit(1)
  }
}

if (!run('node', ['scripts/ensure-ytdlp.js'])) {
  process.exit(1)
}

console.log('Hostinger install completed successfully.')
