#!/usr/bin/env bash
# Load a finished Keep sync: activities.db + GPX_OUT. No Keep login.
set -euo pipefail

cd "$(dirname "$0")/.."

PY=python3
if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
fi

args=()
if [[ $# -ge 1 && -n "${1}" ]]; then
  args+=(--db "$1")
fi
if [[ $# -ge 2 && -n "${2}" ]]; then
  args+=(--gpx "$2")
fi
if [[ $# -gt 2 ]]; then
  args+=("${@:3}")
fi

exec "$PY" run_page/import_dump.py "${args[@]}"
