#!/usr/bin/env bash
set -euo pipefail
# Armosphera One Claude — sovereign local-server installer (offline-first; outbound OFF by default).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-install}"
PORT="${PORT:-4100}"
OS="$(uname -s)"

echo "==> Armosphera One Claude installer ($MODE)"

command -v node >/dev/null || { echo "ERROR: Node.js >=22.5 is required."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then echo "ERROR: Node.js >=22.5 required (found $(node -v))."; exit 1; fi
echo "  node $(node -v) OK"

cd "$ROOT"
npm install
npm run build:ui

if [ -n "${LAWS_DB_SOURCE:-}" ] || [ -f "$HOME/Library/Application Support/HayHashvapahWebClaude/data/laws.sqlite" ]; then
  node scripts/install-laws.js "${LAWS_DB_SOURCE:-}" || echo "  (legal KB not installed — optional; law search/RAG stays empty until a laws.sqlite is provided)"
else
  echo "  (no legal KB source found — run 'node scripts/install-laws.js <path>' later to enable Armenian law search)"
fi

if [ "$OS" = "Darwin" ] && command -v plutil >/dev/null; then
  plutil -lint "$ROOT/deploy/com.armosphera.one.plist.tmpl" >/dev/null && echo "  launchd template OK"
fi

if [ "$MODE" = "--check" ]; then
  echo "==> --check passed (prereqs + build + templates). Service NOT installed."
  exit 0
fi

if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.armosphera.one.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  sed -e "s#__NODE__#$(command -v node)#g" -e "s#__ROOT__#$ROOT#g" -e "s#__PORT__#$PORT#g" \
    "$ROOT/deploy/com.armosphera.one.plist.tmpl" > "$PLIST"
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "==> launchd service com.armosphera.one started on port $PORT"
elif [ "$OS" = "Linux" ]; then
  echo "==> Linux: install the systemd unit (edit placeholders first):"
  echo "    sed -e \"s#__NODE__#$(command -v node)#g\" -e \"s#__ROOT__#$ROOT#g\" -e \"s#__PORT__#$PORT#g\" -e \"s#__USER__#$USER#g\" \\"
  echo "      $ROOT/deploy/armosphera-one.service.tmpl | sudo tee /etc/systemd/system/armosphera-one.service"
  echo "    sudo systemctl daemon-reload && sudo systemctl enable --now armosphera-one"
else
  echo "==> Unknown OS — run 'PORT=$PORT npm start' to launch manually."
fi
echo "==> Open http://127.0.0.1:$PORT  | data: OS app-support dir | outbound network OFF by default."
