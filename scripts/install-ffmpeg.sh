#!/bin/bash
# Static ffmpeg for shared hosting (no root). Puts binary in bin/ffmpeg.
set -e
cd "$(dirname "$0")/.."
mkdir -p bin tmp

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCHIVE="ffmpeg-release-amd64-static.tar.xz" ;;
  aarch64|arm64) ARCHIVE="ffmpeg-release-arm64-static.tar.xz" ;;
  *)
    echo "Unsupported arch: $ARCH"
    exit 1
    ;;
esac

URL="https://johnvansickle.com/ffmpeg/releases/${ARCHIVE}"
echo "Downloading $URL ..."
curl -fsSL "$URL" -o "tmp/${ARCHIVE}"
tar -xJf "tmp/${ARCHIVE}" -C tmp
FF=$(find tmp -maxdepth 2 -type f -name ffmpeg | head -1)
[ -z "$FF" ] && { echo "ffmpeg binary not found in archive"; exit 1; }
cp -f "$FF" bin/ffmpeg
chmod +x bin/ffmpeg
bin/ffmpeg -version | head -1
echo "OK: bin/ffmpeg"
