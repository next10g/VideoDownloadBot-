#!/usr/bin/env node
'use strict'

const path = require('path')
const { installYtdlp } = require('./ytdlp-install-lib')

try {
  installYtdlp(path.join(__dirname, '..'))
  process.exit(0)
} catch (error) {
  console.warn('ensure-ytdlp warning (install continues):', error.message)
  console.warn('On SSH run: bash scripts/install-ytdlp.sh')
  process.exit(0)
}
