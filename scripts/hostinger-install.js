#!/usr/bin/env node
'use strict'

/**
 * Install dependencies on Hostinger (Yarn 4 + no Python for youtube-dl-exec).
 * Usage: node scripts/hostinger-install.js
 */

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const YARN_CLI = path.join(ROOT, '.yarn', 'releases', 'yarn-4.1.1.cjs')

const env = {
  ...process.env,
  YOUTUBE_DL_SKIP_PYTHON_CHECK: '1',
}

function run(cmd, args, options = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...env, ...options.env },
    cwd: options.cwd || ROOT,
    shell: false,
  })
  return result.status === 0
}

function installWithYarn() {
  if (fs.existsSync(YARN_CLI)) {
    console.log('Using bundled Yarn 4:', YARN_CLI)
    return run('node', [YARN_CLI, 'install'])
  }
  if (run('corepack', ['enable'])) {
    return run('yarn', ['install'])
  }
  return run('yarn', ['install'])
}

if (!installWithYarn()) {
  console.log('Yarn install failed — retrying with npm --ignore-scripts')
  if (!run('npm', ['install', '--ignore-scripts'])) {
    process.exit(1)
  }
}

if (!run('node', ['scripts/ensure-ytdlp.js'])) {
  process.exit(1)
}

console.log('Hostinger install completed successfully.')
