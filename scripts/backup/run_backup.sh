#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%Y-%m-%d)"
OUT_DIR="${1:-./backups/$STAMP}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required. Install from https://supabase.com/docs/guides/cli"
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Writing schema dump to $OUT_DIR/db_schema.sql"
supabase db dump --schema public > "$OUT_DIR/db_schema.sql"

echo "Writing data dump to $OUT_DIR/db_data.sql"
supabase db dump --schema public --data-only > "$OUT_DIR/db_data.sql"

echo "Backup complete: $OUT_DIR"
