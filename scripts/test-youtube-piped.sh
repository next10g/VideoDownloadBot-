#!/bin/bash
# Test Piped + Invidious reachability from server (no full download)
set -e
cd "$(dirname "$0")/.."
VIDEO_ID="${1:-jNQXAC9IVRw}"

echo "=== Piped APIs (first success wins) ==="
for base in \
  https://pipedapi.tokhmi.xyz \
  https://pipedapi.moomoo.me \
  https://api-piped.mha.fi \
  https://piped-api.lunar.icu \
  https://pipedapi.kavin.rocks; do
  url="${base%/}/streams/${VIDEO_ID}"
  if curl -fsS --max-time 25 -H 'Accept: application/json' "$url" | head -c 200 >/dev/null 2>&1; then
    echo "OK  $base"
    exit 0
  else
    echo "FAIL $base"
  fi
done

echo ""
echo "=== Invidious APIs ==="
for base in \
  https://inv.tux.pizza \
  https://invidious.private.coffee \
  https://inv.nadeko.net \
  https://yt.artemislena.eu; do
  url="${base%/}/api/v1/videos/${VIDEO_ID}"
  if curl -fsS --max-time 25 -H 'Accept: application/json' "$url" | head -c 200 >/dev/null 2>&1; then
    echo "OK  $base"
    exit 0
  else
    echo "FAIL $base"
  fi
done

echo ""
echo "All failed from this server — try YOUTUBE_BACKEND=auto or contact host about outbound HTTPS"
exit 1
