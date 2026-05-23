#!/bin/bash
# Static ffmpeg for shared hosting (no root). Uses .tar.gz or python3+lzma for .tar.xz.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
mkdir -p bin tmp
rm -rf tmp/ffmpeg-extract
mkdir -p tmp/ffmpeg-extract

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) BASE="ffmpeg-release-amd64-static" ;;
  aarch64|arm64) BASE="ffmpeg-release-arm64-static" ;;
  *)
    echo "Unsupported arch: $ARCH"
    exit 1
    ;;
esac

copy_ffmpeg() {
  local ff
  ff=$(find tmp/ffmpeg-extract -type f -name ffmpeg 2>/dev/null | head -1)
  if [ -z "$ff" ]; then
    return 1
  fi
  cp -f "$ff" bin/ffmpeg
  chmod +x bin/ffmpeg
  bin/ffmpeg -version | head -1
  echo "OK: bin/ffmpeg"
}

try_tar_gz() {
  local url="https://johnvansickle.com/ffmpeg/releases/${BASE}.tar.gz"
  echo "Downloading $url ..."
  curl -fsSL "$url" -o "tmp/ffmpeg.tar.gz"
  tar -xzf "tmp/ffmpeg.tar.gz" -C tmp/ffmpeg-extract
  copy_ffmpeg
}

try_tar_xz_python() {
  local url="https://johnvansickle.com/ffmpeg/releases/${BASE}.tar.xz"
  echo "Downloading $url (extract with python3, no xz binary) ..."
  curl -fsSL "$url" -o "tmp/ffmpeg.tar.xz"
  python3 - "$ROOT" <<'PY'
import glob
import lzma
import os
import shutil
import sys
import tarfile

root = sys.argv[1]
archive = os.path.join(root, "tmp", "ffmpeg.tar.xz")
extract_to = os.path.join(root, "tmp", "ffmpeg-extract")
out = os.path.join(root, "bin", "ffmpeg")
os.makedirs(extract_to, exist_ok=True)
with lzma.open(archive) as xz_file:
    with tarfile.open(fileobj=xz_file) as tar:
        tar.extractall(extract_to)
matches = []
for pattern in (
    os.path.join(extract_to, "ffmpeg"),
    os.path.join(extract_to, "*", "ffmpeg"),
    os.path.join(extract_to, "*", "*", "ffmpeg"),
):
    matches.extend(glob.glob(pattern))
if not matches:
    for dirpath, _, files in os.walk(extract_to):
        if "ffmpeg" in files:
            matches.append(os.path.join(dirpath, "ffmpeg"))
            break
if not matches:
    sys.exit(1)
shutil.copy2(matches[0], out)
PY
  chmod +x bin/ffmpeg
  bin/ffmpeg -version | head -1
  echo "OK: bin/ffmpeg (python3 + tar.xz)"
}

if try_tar_gz 2>/dev/null; then
  exit 0
fi

echo "tar.gz failed, trying tar.xz via python3..."
rm -rf tmp/ffmpeg-extract
mkdir -p tmp/ffmpeg-extract

if try_tar_xz_python; then
  exit 0
fi

echo "ERROR: Could not install ffmpeg."
echo "Note: TikTok often works WITHOUT ffmpeg. Upload issues are separate (Telegram network)."
exit 1
