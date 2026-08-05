#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 <local|linked> <backup-root>" >&2
  echo "Example: $0 linked /secure/backups/asgc-$(date +%Y-%m-%d)" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 64
fi

TARGET="$1"
BACKUP_ROOT="$2"
DESTINATION="$BACKUP_ROOT/database"

case "$TARGET" in
  local)
    TARGET_FLAG="--local"
    ;;
  linked)
    TARGET_FLAG="--linked"
    ;;
  *)
    usage
    exit 64
    ;;
esac

if [[ -e "$DESTINATION" ]]; then
  echo "Refusing to overwrite existing database backup: $DESTINATION" >&2
  exit 73
fi

if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
elif command -v npx >/dev/null 2>&1; then
  SUPABASE=(npx --yes supabase@2.111.0)
else
  echo "Supabase CLI or npx is required." >&2
  exit 69
fi

mkdir -p "$BACKUP_ROOT"
STAGING_DIR="$(mktemp -d "$BACKUP_ROOT/.database.partial.XXXXXX")"
cleanup() {
  rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

echo "Writing database roles..."
"${SUPABASE[@]}" db dump "$TARGET_FLAG" --role-only --file "$STAGING_DIR/roles.sql"

echo "Writing database schema..."
"${SUPABASE[@]}" db dump "$TARGET_FLAG" --file "$STAGING_DIR/schema.sql"

echo "Writing database data..."
"${SUPABASE[@]}" db dump "$TARGET_FLAG" \
  --data-only \
  --use-copy \
  --exclude "storage.buckets_vectors" \
  --exclude "storage.vector_indexes" \
  --file "$STAGING_DIR/data.sql"

mv -- "$STAGING_DIR" "$DESTINATION"
trap - EXIT

echo "Database backup complete: $DESTINATION"
