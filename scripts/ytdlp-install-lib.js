#!/usr/bin/env node
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SCRIPT_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
const STANDALONE_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'

const PYTHON_CANDIDATES = [
  process.env.YTDLP_PYTHON,
  '/opt/alt/alt-python312/bin/python3.12',
  '/opt/alt/alt-python311/bin/python3.11',
  '/opt/alt/alt-python310/bin/python3.10',
  '/opt/alt/alt-python39/bin/python3.9',
  'python3.12',
  'python3.11',
  'python3.10',
].filter(Boolean)

function projectBin(projectRoot) {
  return path.join(projectRoot, 'bin')
}

function wrapperPath(projectRoot) {
  return path.join(projectBin(projectRoot), 'yt-dlp')
}

function scriptPath(projectRoot) {
  return path.join(projectBin(projectRoot), 'yt-dlp.py')
}

function canExecute(binary, args = ['--version']) {
  try {
    if (!fs.existsSync(binary)) return false
    const st = fs.statSync(binary)
    if (!st.isFile() && !st.isDirectory()) return false
    execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function findPython310() {
  for (const py of PYTHON_CANDIDATES) {
    try {
      execFileSync(
        py,
        ['-c', 'import sys; assert sys.version_info[:2] >= (3, 10)'],
        { timeout: 10_000, stdio: 'pipe' }
      )
      return py
    } catch {
      // try next
    }
  }
  return null
}

function prepareBinDir(projectRoot) {
  const binDir = projectBin(projectRoot)
  fs.mkdirSync(binDir, { recursive: true })
  const dest = wrapperPath(projectRoot)
  if (fs.existsSync(dest)) {
    const st = fs.statSync(dest)
    if (st.isDirectory()) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
  }
  const pyScript = scriptPath(projectRoot)
  if (fs.existsSync(pyScript)) {
    try {
      fs.unlinkSync(pyScript)
    } catch {
      // ignore
    }
  }
}

function download(url, dest) {
  execFileSync('curl', ['-fsSL', url, '-o', dest], {
    stdio: 'inherit',
    timeout: 120_000,
  })
}

function tryStandaloneLinux(projectRoot) {
  if (process.platform !== 'linux') {
    return false
  }
  const dest = wrapperPath(projectRoot)
  prepareBinDir(projectRoot)
  console.log('Trying standalone yt-dlp_linux...')
  download(STANDALONE_URL, dest)
  try {
    fs.chmodSync(dest, 0o755)
  } catch {
    // ignore
  }
  if (canExecute(dest)) {
    console.log('Standalone yt-dlp_linux OK:', dest)
    return true
  }
  console.warn('Standalone yt-dlp_linux failed (common on shared hosting — using Python)')
  try {
    fs.unlinkSync(dest)
  } catch {
    // ignore
  }
  return false
}

function installPythonWrapper(projectRoot, pythonPath) {
  const py = pythonPath || findPython310()
  if (!py) {
    throw new Error(
      'No Python 3.10+ found. On Hostinger try: /opt/alt/alt-python311/bin/python3.11 --version'
    )
  }
  prepareBinDir(projectRoot)
  const script = scriptPath(projectRoot)
  const wrapper = wrapperPath(projectRoot)
  console.log('Installing yt-dlp script with', py)
  download(SCRIPT_URL, script)
  try {
    fs.chmodSync(script, 0o755)
  } catch {
    // ignore
  }
  const content = `#!/bin/bash
# Auto-generated — runs yt-dlp with Python 3.10+ (Hostinger alt-python)
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${py.replace(/"/g, '\\"')}" "$DIR/yt-dlp.py" "$@"
`
  fs.writeFileSync(wrapper, content, { mode: 0o755 })
  if (!canExecute(wrapper)) {
    throw new Error(`Wrapper failed: ${wrapper}`)
  }
  console.log('yt-dlp OK:', wrapper, '(via', py + ')')
  return wrapper
}

function installYtdlp(projectRoot) {
  projectRoot = projectRoot || path.join(__dirname, '..')
  const existing = wrapperPath(projectRoot)
  if (canExecute(existing)) {
    console.log('yt-dlp already OK:', existing)
    return existing
  }
  if (tryStandaloneLinux(projectRoot)) {
    return wrapperPath(projectRoot)
  }
  const forcedPy = process.env.YTDLP_PYTHON
  return installPythonWrapper(projectRoot, forcedPy || undefined)
}

module.exports = {
  installYtdlp,
  findPython310,
  wrapperPath,
  canExecute,
}

if (require.main === module) {
  try {
    installYtdlp(process.argv[2])
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
