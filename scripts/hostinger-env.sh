#!/bin/bash
# Source before SSH commands:  source scripts/hostinger-env.sh
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
export YOUTUBE_DL_SKIP_PYTHON_CHECK=1

if command -v node >/dev/null 2>&1; then
  echo "node: $(node --version) ($(command -v node))"
else
  echo "node not found — use full path:"
  echo "  /opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js"
fi
