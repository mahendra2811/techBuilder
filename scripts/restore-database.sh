#!/usr/bin/env bash
# Restore an RDS logical backup from S3. NEVER defaults to a target -- you must always name one
# explicitly, to make it hard to accidentally overwrite production.
#
# Usage:
#   ./scripts/restore-database.sh --key backups/techbuilder-2026-07-15T20-30-00Z.dump \
#                                  --target "postgresql://user:pass@host:5432/db?sslmode=require" [--yes]
#
# RECOMMENDED for the required restore drill: restore into a throwaway RDS instance or a local/
# Docker Postgres, never the primary production instance.
#
# Required env: BACKUP_S3_BUCKET, AWS_REGION
# Optional env: PG_MAJOR (default 17 -- match the RDS engine version the dump was taken from)
set -euo pipefail

KEY=""
TARGET=""
ASSUME_YES=0
PG_MAJOR="${PG_MAJOR:-17}"
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$KEY" ] || [ -z "$TARGET" ]; then
  echo "Usage: $0 --key <s3-object-key> --target <postgres-url> [--yes]" >&2
  exit 1
fi
for v in BACKUP_S3_BUCKET AWS_REGION; do
  if [ -z "${!v:-}" ]; then
    echo "Missing required env var: $v" >&2
    exit 1
  fi
done

echo "WARNING: this will DROP and RECREATE objects in the TARGET database (--clean --if-exists)."
echo "    Target: ${TARGET%%@*}@***  (credentials hidden)"
echo "    Source: s3://${BACKUP_S3_BUCKET}/${KEY}"
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Type 'restore' to continue: " CONFIRM
  if [ "$CONFIRM" != "restore" ]; then
    echo "Aborted."
    exit 1
  fi
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
FILE="$(basename "$KEY")"

echo "-> Downloading from S3..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${KEY}" "${WORKDIR}/${FILE}" --region "$AWS_REGION"

echo "-> Restoring into target via postgres:${PG_MAJOR} image..."
docker run --rm -v "${WORKDIR}":/workdir -w /workdir "postgres:${PG_MAJOR}" \
  pg_restore --dbname="$TARGET" --clean --if-exists --no-owner --no-privileges "$FILE"

echo "Restore complete. Verify row counts / spot-check data in the target DB now (see docs/deployment/BACKUP_AND_RESTORE.md's verification queries) before trusting this dump."
