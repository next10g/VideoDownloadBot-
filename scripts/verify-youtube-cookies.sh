#!/bin/bash
# Quick check: are cookies.txt still valid? (no full download)
set -e
cd "$(dirname "$0")/.."

chmod +x bin/yt-dlp 2>/dev/null || true

if [ ! -f cookies.txt ]; then
  echo "ERROR: cookies.txt missing"
  exit 1
fi

NODE="${YTDLP_NODE_PATH:-}"
for candidate in \
  "${YTDLP_NODE_PATH:-}" \
  /opt/alt/alt-nodejs22/root/usr/bin/node \
  /opt/alt/alt-nodejs20/root/usr/bin/node; do
  [ -z "$candidate" ] && continue
  [ -x "$candidate" ] && NODE="$candidate" && break
done

if [ -z "$NODE" ]; then
  echo "ERROR: Node not found"
  exit 1
fi

echo "Node: $NODE"
echo "Checking cookies (no download)..."

LOG=$(mktemp)
set +e
./bin/yt-dlp --cookies ./cookies.txt --js-runtimes "node:$NODE" \
  --skip-download --print title \
  "https://www.youtube.com/watch?v=jNQXAC9IVRw" 2>"$LOG"
CODE=$?
set -e

cat "$LOG"

if grep -qi 'cookies are no longer valid\|likely been rotated' "$LOG"; then
  echo ""
  echo "FAIL: cookies.txt EXPIRED — export again from Chrome (Get cookies.txt LOCALLY)"
  rm -f "$LOG"
  exit 2
fi

if grep -qi 'sign in to confirm' "$LOG"; then
  echo ""
  echo "FAIL: YouTube blocked this server IP (and/or cookies). Refresh cookies; try PO token or VPS."
  rm -f "$LOG"
  exit 3
fi

if [ "$CODE" -ne 0 ]; then
  echo ""
  echo "FAIL: yt-dlp exit $CODE"
  rm -f "$LOG"
  exit 1
fi

rm -f "$LOG"
echo ""
echo "OK: cookies look usable for metadata (download may still fail on long videos)"
