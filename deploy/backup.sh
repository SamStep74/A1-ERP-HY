#!/usr/bin/env bash
set -euo pipefail
# Consistent, rotated backup of the Armosphera One Claude SQLite database.
if [ "$(uname -s)" = "Linux" ]; then
  DEFAULT_DB="$HOME/.local/share/armosphera-one-claude/armosphera-one.db"
else
  DEFAULT_DB="$HOME/Library/Application Support/ArmospheraOneClaude/armosphera-one.db"
fi
DB="${ARMOSPHERA_ONE_DB:-$DEFAULT_DB}"
[ -f "$DB" ] || { echo "ERROR: database not found at $DB"; exit 1; }
BACKUP_DIR="${1:-$(dirname "$DB")/backups}"
mkdir -p "$BACKUP_DIR"
DEST="$BACKUP_DIR/armosphera-one-$(date +%Y%m%d-%H%M%S).db"
if command -v sqlite3 >/dev/null; then
  sqlite3 "$DB" ".backup '$DEST'"
else
  cp "$DB" "$DEST"
fi
ls -1t "$BACKUP_DIR"/armosphera-one-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Backup -> $DEST (kept last 14)"
