#!/bin/bash
# Install yt-dlp on Hostinger/shared Linux (standalone or Python 3.10+ wrapper).
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

find_python() {
  local candidates=(
    "${YTDLP_PYTHON:-}"
    /opt/alt/alt-python312/bin/python3.12
    /opt/alt/alt-python311/bin/python3.11
    /opt/alt/alt-python310/bin/python3.10
    python3.12
    python3.11
    python3.10
  )
  for py in "${candidates[@]}"; do
    [ -z "$py" ] && continue
    if "$py" -c 'import sys; exit(0 if sys.version_info[:2] >= (3,10) else 1)' 2>/dev/null; then
      echo "$py"
      return 0
    fi
  done
  return 1
}

test_bin() {
  [ -f "$1" ] && "$1" --version >/dev/null 2>&1
}

mkdir -p bin
rm -rf bin/yt-dlp
rm -f bin/yt-dlp.py

echo "Trying standalone yt-dlp_linux..."
if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o bin/yt-dlp; then
  chmod +x bin/yt-dlp
  if test_bin bin/yt-dlp; then
    bin/yt-dlp --version
    echo "OK: standalone bin/yt-dlp"
    exit 0
  fi
  echo "Standalone failed (libz/noexec) — switching to Python wrapper..."
  rm -f bin/yt-dlp
fi

PY="$(find_python)" || {
  echo "ERROR: No Python 3.10+. Try:"
  echo "  /opt/alt/alt-python311/bin/python3.11 --version"
  echo "  export YTDLP_PYTHON=/opt/alt/alt-python311/bin/python3.11"
  exit 1
}

echo "Using Python: $PY"
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
