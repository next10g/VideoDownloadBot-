#!/usr/bin/env node
'use strict'

/**
 * Compile TypeScript on Hostinger without executing node_modules/.bin/tsc
 * (shared hosting often strips +x on .bin symlinks → "Permission denied").
 *
 * SSH: /opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-build.js
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')

function findNode() {
  const fromEnv = process.env.YTDLP_NODE_PATH
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv
  }
  for (const dir of [
    '/opt/alt/alt-nodejs20/root/usr/bin',
    '/opt/alt/alt-nodejs22/root/usr/bin',
    '/opt/alt/alt-nodejs18/root/usr/bin',
  ]) {
    const full = `${dir}/node`
    if (fs.existsSync(full)) {
      return full
    }
  }
  return 'node'
}

function fixBinPermissions() {
  const binDir = path.join(root, 'node_modules', '.bin')
  if (!fs.existsSync(binDir)) {
    return
  }
  for (const name of fs.readdirSync(binDir)) {
    const full = path.join(binDir, name)
    try {
      fs.chmodSync(full, 0o755)
    } catch {
      /* ignore */
    }
  }
}

const nodeBin = findNode()

if (!fs.existsSync(tscJs)) {
  console.error('typescript not installed — run: npm install')
  process.exit(1)
}

fixBinPermissions()

console.log('Using node:', nodeBin)
console.log('> tsc --skipLibCheck (via node, no .bin/tsc)')

const result = spawnSync(nodeBin, [tscJs, '--skipLibCheck'], {
  stdio: 'inherit',
  cwd: root,
})

if (result.status !== 0) {
  process.exit(result.status || 1)
}

console.log('Build OK — dist/ updated.')
