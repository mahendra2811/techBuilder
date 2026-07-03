#!/usr/bin/env bash
# WP-8 — restore a backup from R2. NEVER defaults to a target — you must always name one
# explicitly, to make it hard to accidentally overwrite production.
#
# Usage:
#   ./scripts/restore-db.sh --key backups/techbuilder-2026-07-03T02-00-00Z.dump \
#                            --target "postgres://user:pass@host/db?sslmode=require" [--yes]
#
# RECOMMENDED for the required "restore drill": create a throwaway Neon branch
# (Neon console → your project → Branches → New Branch) and pass ITS connection
# string as --target. Never point this at the primary/production branch.
#
# Env required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
# Requires: Docker (runs pg_restore via the official `postgres` image — exact version match, no
#           local install needed). PG_MAJOR env optional, default 18.
set -euo pipefail

KEY=""
TARGET=""
ASSUME_YES=0
PG_MAJOR="${PG_MAJOR:-18}"
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$KEY" ] || [ -z "$TARGET" ]; then
  echo "Usage: $0 --key <r2-object-key> --target <postgres-url> [--yes]" >&2
  exit 1
fi
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  if [ -z "${!v:-}" ]; then
    echo "❌ Missing required env var: $v" >&2
    exit 1
  fi
done

echo "⚠️  This will DROP and RECREATE objects in the TARGET database (--clean --if-exists)."
echo "    Target: ${TARGET%%@*}@***  (credentials hidden)"
echo "    Source: s3://${R2_BUCKET}/${KEY}"
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Type 'restore' to continue: " CONFIRM
  if [ "$CONFIRM" != "restore" ]; then
    echo "Aborted."
    exit 1
  fi
fi

FILE="$(basename "$KEY")"
echo "→ Downloading from R2..."
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
aws s3 cp "s3://${R2_BUCKET}/${KEY}" "./${FILE}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "→ Restoring into target via postgres:${PG_MAJOR} image..."
docker run --rm -v "$(pwd)":/workdir -w /workdir "postgres:${PG_MAJOR}" \
  pg_restore --dbname="$TARGET" --clean --if-exists --no-owner --no-privileges "$FILE"

rm -f "$FILE"
echo "✅ Restore drill complete. Verify row counts / spot-check data in the target DB now."
