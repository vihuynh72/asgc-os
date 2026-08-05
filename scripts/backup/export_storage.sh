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
DESTINATION="$BACKUP_ROOT/storage"

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
  echo "Refusing to overwrite existing storage backup: $DESTINATION" >&2
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
STAGING_DIR="$(mktemp -d "$BACKUP_ROOT/.storage.partial.XXXXXX")"
cleanup() {
  rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

echo "Writing recursive storage manifest..."
"${SUPABASE[@]}" storage ls "$TARGET_FLAG" --recursive --output-format json ss:/// \
  > "$STAGING_DIR/manifest.json"

echo "Downloading all storage buckets..."
"${SUPABASE[@]}" storage cp "$TARGET_FLAG" --recursive --jobs 4 ss:/// \
  "$STAGING_DIR/objects"

mv -- "$STAGING_DIR" "$DESTINATION"
trap - EXIT

echo "Storage backup complete: $DESTINATION"
