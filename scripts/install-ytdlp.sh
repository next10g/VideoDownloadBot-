#!/bin/bash
# Install standalone yt-dlp (no Python 3.10+ required). Run from project root via SSH.
set -e
cd "$(dirname "$0")/.."
DEST="bin/yt-dlp"
mkdir -p bin
if [ -d "$DEST" ]; then
  echo "Removing wrong $DEST directory..."
  rm -rf "$DEST"
fi
if [ -f "$DEST" ]; then
  rm -f "$DEST"
fi
echo "Downloading yt-dlp_linux to $DEST ..."
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o "$DEST"
chmod +x "$DEST"
"$DEST" --version
echo "OK: $DEST"
