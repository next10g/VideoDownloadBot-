#!/bin/bash
# Install yt-dlp on shared Linux (Hostinger): standalone → system Py3.10+ → portable Python.
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

export PATH="/opt/alt/alt-nodejs20/root/usr/bin:/opt/alt/alt-nodejs18/root/usr/bin:$PATH"

if command -v node >/dev/null 2>&1; then
  echo "Using node: $(command -v node)"
  node scripts/ytdlp-install-lib.js "$ROOT"
  exit $?
fi

echo "node not in PATH — running bash installer..."

test_bin() {
  [ -f "$1" ] && "$1" --version >/dev/null 2>&1
}

find_python() {
  local candidates=(
    "${YTDLP_PYTHON:-}"
    /opt/alt/alt-python312/bin/python3.12
    /opt/alt/alt-python311/bin/python3.11
    /opt/alt/alt-python310/bin/python3.10
    python3.12 python3.11 python3.10
  )
  for py in "${candidates[@]}"; do
    [ -z "$py" ] && continue
    if "$py" -c 'import sys; exit(0 if sys.version_info[:2] >= (3,10) else 1)' 2>/dev/null; then
      echo "$py"
      return 0
    fi
  done
  while IFS= read -r py; do
    [ -z "$py" ] && continue
    if "$py" -c 'import sys; exit(0 if sys.version_info[:2] >= (3,10) else 1)' 2>/dev/null; then
      echo "$py"
      return 0
    fi
  done < <(find /opt /usr/local -maxdepth 6 -type f \( -name 'python3.10' -o -name 'python3.11' -o -name 'python3.12' \) 2>/dev/null | head -10)
  return 1
}

install_portable_python() {
  PYTHON_DIR="$ROOT/.python"
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
    *) TARGET="x86_64-unknown-linux-gnu" ;;
  esac
  URL="https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-${TARGET}-install_only.tar.gz"

  if [ ! -x "$PYTHON_DIR/bin/python3.12" ] && [ ! -x "$PYTHON_DIR/bin/python3.11" ]; then
    echo "Downloading portable Python (~50MB, one-time)..."
    mkdir -p "$PYTHON_DIR"
    curl -fsSL "$URL" | tar -xzf - -C "$PYTHON_DIR" --strip-components=1
  fi

  PY=$(ls "$PYTHON_DIR"/bin/python3.1* 2>/dev/null | sort -V | tail -1)
  [ -z "$PY" ] && { echo "Portable Python extract failed"; exit 1; }

  echo "Installing yt-dlp via pip ($PY)..."
  "$PY" -m pip install -U pip yt-dlp

  mkdir -p "$ROOT/bin"
  cp -f "$PYTHON_DIR/bin/yt-dlp" "$ROOT/bin/yt-dlp"
  chmod +x "$ROOT/bin/yt-dlp"
}

mkdir -p bin
rm -rf bin/yt-dlp bin/yt-dlp.py

echo "Trying standalone yt-dlp_linux..."
if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o bin/yt-dlp; then
  chmod +x bin/yt-dlp
  if test_bin bin/yt-dlp; then
    bin/yt-dlp --version
    echo "OK: standalone bin/yt-dlp"
    exit 0
  fi
  echo "Standalone failed — trying Python..."
  rm -f bin/yt-dlp
fi

if PY="$(find_python)"; then
  echo "Using system Python: $PY"
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o bin/yt-dlp.py
  chmod +x bin/yt-dlp.py
  cat > bin/yt-dlp << EOF
#!/bin/bash
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
exec "$PY" "\$DIR/yt-dlp.py" "\$@"
EOF
  chmod +x bin/yt-dlp
  bin/yt-dlp --version
  echo "OK: bin/yt-dlp (Python wrapper)"
  exit 0
fi

echo "No Python 3.10+ on server — using portable Python in .python/"
install_portable_python
bin/yt-dlp --version
echo "OK: bin/yt-dlp (portable Python)"
