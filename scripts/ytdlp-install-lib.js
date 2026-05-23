#!/usr/bin/env node
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SCRIPT_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
const STANDALONE_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'

const PORTABLE_TAG = '20241016'
const PORTABLE_VERSION = '3.12.7'

const PYTHON_CANDIDATES = [
  process.env.YTDLP_PYTHON,
  '/opt/alt/alt-python312/bin/python3.12',
  '/opt/alt/alt-python311/bin/python3.11',
  '/opt/alt/alt-python310/bin/python3.10',
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

function portablePythonDir(projectRoot) {
  return path.join(projectRoot, '.python')
}

function canExecute(binary, args = ['--version']) {
  try {
    if (!fs.existsSync(binary)) return false
    if (!fs.statSync(binary).isFile()) return false
    execFileSync(binary, args, { encoding: 'utf8', timeout: 60_000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function pythonMeets310(py) {
  try {
    execFileSync(
      py,
      ['-c', 'import sys; assert sys.version_info[:2] >= (3, 10)'],
      { timeout: 15_000, stdio: 'pipe' }
    )
    return true
  } catch {
    return false
  }
}

function findPythonViaFind() {
  if (process.platform !== 'linux') {
    return null
  }
  try {
    const out = execFileSync(
      'bash',
      [
        '-c',
        "find /opt /usr/local -maxdepth 6 -type f \\( -name 'python3.10' -o -name 'python3.11' -o -name 'python3.12' -o -name 'python3.13' \\) 2>/dev/null | head -15",
      ],
      { encoding: 'utf8', timeout: 45_000 }
    )
    for (const line of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (pythonMeets310(line)) {
        return line
      }
    }
  } catch {
    // ignore
  }
  return null
}

function findPython310() {
  for (const py of PYTHON_CANDIDATES) {
    if (pythonMeets310(py)) {
      return py
    }
  }
  return findPythonViaFind()
}

function getPortablePythonUrl() {
  let arch = 'x86_64'
  try {
    arch = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim()
  } catch {
    // default
  }
  const target =
    arch === 'aarch64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
  return `https://github.com/indygreg/python-build-standalone/releases/download/${PORTABLE_TAG}/cpython-${PORTABLE_VERSION}+${PORTABLE_TAG}-${target}-install_only.tar.gz`
}

function findPortablePythonBin(projectRoot) {
  const binDir = path.join(portablePythonDir(projectRoot), 'bin')
  if (!fs.existsSync(binDir)) {
    return null
  }
  const names = fs
    .readdirSync(binDir)
    .filter((f) => /^python3\.1[0-9]$/.test(f))
    .sort()
    .reverse()
  return names[0] ? path.join(binDir, names[0]) : null
}

function prepareBinDir(projectRoot) {
  fs.mkdirSync(projectBin(projectRoot), { recursive: true })
  const dest = wrapperPath(projectRoot)
  if (fs.existsSync(dest)) {
    const st = fs.statSync(dest)
    if (st.isDirectory()) {
      fs.rmSync(dest, { recursive: true, force: true })
    } else {
      try {
        fs.unlinkSync(dest)
      } catch {
        // ignore
      }
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
  prepareBinDir(projectRoot)
  const dest = wrapperPath(projectRoot)
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
  console.warn('Standalone yt-dlp_linux failed (libz/noexec on shared hosting)')
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
    return null
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
# Auto-generated — yt-dlp via Python 3.10+
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${py.replace(/"/g, '\\"')}" "$DIR/yt-dlp.py" "$@"
`
  fs.writeFileSync(wrapper, content, { mode: 0o755 })
  try {
    fs.chmodSync(wrapper, 0o755)
  } catch {
    // ignore
  }
  if (!canExecute(wrapper)) {
    throw new Error(`Wrapper failed: ${wrapper}`)
  }
  console.log('yt-dlp OK:', wrapper, '(via', py + ')')
  return wrapper
}

function installPortablePython(projectRoot) {
  const pythonDir = portablePythonDir(projectRoot)
  let python = findPortablePythonBin(projectRoot)

  if (!python) {
    const url = getPortablePythonUrl()
    console.log('No Python 3.10+ on server — installing portable Python (~50MB, one-time)...')
    console.log(url)
    fs.mkdirSync(pythonDir, { recursive: true })
    execFileSync(
      'bash',
      ['-c', `curl -fsSL "${url}" | tar -xzf - -C "${pythonDir}" --strip-components=1`],
      { stdio: 'inherit', timeout: 600_000 }
    )
    python = findPortablePythonBin(projectRoot)
    if (!python) {
      throw new Error('Portable Python extract failed — check disk quota and curl')
    }
  }

  console.log('Installing yt-dlp via pip into', pythonDir)
  execFileSync(python, ['-m', 'pip', 'install', '-U', 'pip', 'yt-dlp'], {
    stdio: 'inherit',
    timeout: 300_000,
  })

  const ytdlpBuilt = path.join(path.dirname(python), 'yt-dlp')
  if (!fs.existsSync(ytdlpBuilt)) {
    throw new Error(`pip install ok but ${ytdlpBuilt} missing`)
  }

  prepareBinDir(projectRoot)
  const wrapper = wrapperPath(projectRoot)
  fs.copyFileSync(ytdlpBuilt, wrapper)
  fs.chmodSync(wrapper, 0o755)

  if (!canExecute(wrapper)) {
    throw new Error(`Portable yt-dlp not runnable: ${wrapper}`)
  }
  console.log('yt-dlp OK:', wrapper, '(portable Python in .python/)')
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
  if (forcedPy && pythonMeets310(forcedPy)) {
    return installPythonWrapper(projectRoot, forcedPy)
  }

  const systemPy = findPython310()
  if (systemPy) {
    return installPythonWrapper(projectRoot, systemPy)
  }

  return installPortablePython(projectRoot)
}

module.exports = {
  installYtdlp,
  findPython310,
  wrapperPath,
  canExecute,
  installPortablePython,
}

if (require.main === module) {
  try {
    installYtdlp(process.argv[2])
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
