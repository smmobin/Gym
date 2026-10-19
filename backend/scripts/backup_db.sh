#!/usr/bin/env bash
# Linux/macOS helper — uses backend/.venv when present
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -x "$BACKEND/.venv/bin/python" ]]; then
  PY="$BACKEND/.venv/bin/python"
else
  PY="${PYTHON:-python3}"
fi
exec "$PY" "$SCRIPT_DIR/backup_db.py" "$@"
