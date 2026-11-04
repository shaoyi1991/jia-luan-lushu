#!/usr/bin/env bash
# Full Keep history → SQLite, GPX, activities.json, totals SVG.
# Credentials: KEEP_MOBILE and KEEP_PASSWORD, or a gitignored .env file.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${KEEP_MOBILE:-}" || -z "${KEEP_PASSWORD:-}" ]]; then
  echo "请设置 KEEP_MOBILE 与 KEEP_PASSWORD（可写在未提交的 .env 里）。" >&2
  exit 2
fi

python3 run_page/keep_sync.py --with-gpx --sync-types running cycling hiking "$@"
python3 run_page/gen_svg.py
