#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%Y-%m-%d)"
OUT_DIR="${1:-./backups/$STAMP}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required. Install from https://supabase.com/docs/guides/cli"
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Listing buckets..."
supabase storage list > "$OUT_DIR/storage_buckets.txt"

echo "Storage export stub created at $OUT_DIR."
echo "Use the Supabase dashboard or CLI to export bucket contents."
