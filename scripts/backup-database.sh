#!/usr/bin/env bash
# Nightly RDS PostgreSQL -> S3 logical backup (custom-format pg_dump).
#
# Runs pg_dump via the official `postgres` Docker image, pinned to the RDS engine's own major
# version, to avoid the exact client/server version-mismatch class of bug this repo already hit
# once with its Neon->R2 pipeline (see docs/PENDING-AND-DEFERRED.md). Uses DATABASE_URL_ADMIN (the
# privileged/master role) so the dump captures everything, not just what an RLS-scoped role could see.
#
# Required env: DATABASE_URL_ADMIN, BACKUP_S3_BUCKET, AWS_REGION
# Optional env: PG_MAJOR (default 17 -- MUST match whatever RDS engine version you actually
#               created; verify in the console, do not assume)
#
# On the EC2 box with its instance IAM role attached, the AWS CLI needs no separate credentials.
# Running elsewhere (e.g. GitHub Actions), export AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY too.
set -euo pipefail

for v in DATABASE_URL_ADMIN BACKUP_S3_BUCKET AWS_REGION; do
  if [ -z "${!v:-}" ]; then
    echo "Missing required env var: $v" >&2
    exit 1
  fi
done
PG_MAJOR="${PG_MAJOR:-17}"

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILE="techbuilder-${TIMESTAMP}.dump"
KEY="backups/${FILE}"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "-> Dumping database via postgres:${PG_MAJOR} image (custom format)..."
docker run --rm -v "${WORKDIR}":/workdir -w /workdir "postgres:${PG_MAJOR}" \
  pg_dump "$DATABASE_URL_ADMIN" --format=custom --no-owner --no-privileges --file="$FILE"

if [ ! -s "${WORKDIR}/${FILE}" ]; then
  echo "Backup file is empty or missing -- aborting without uploading." >&2
  exit 1
fi
SIZE=$(du -h "${WORKDIR}/${FILE}" | cut -f1)
echo "Dump complete: $FILE ($SIZE)"

echo "-> Uploading to s3://${BACKUP_S3_BUCKET}/${KEY}"
aws s3 cp "${WORKDIR}/${FILE}" "s3://${BACKUP_S3_BUCKET}/${KEY}" --region "$AWS_REGION"

# Verify the object actually landed (belt-and-suspenders on top of `aws s3 cp`'s own exit code).
REMOTE_SIZE=$(aws s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$KEY" --region "$AWS_REGION" --query ContentLength --output text 2>/dev/null || echo "")
if [ -z "$REMOTE_SIZE" ] || [ "$REMOTE_SIZE" = "0" ]; then
  echo "Upload verification failed -- object missing or zero-length in S3." >&2
  exit 1
fi

echo "Uploaded and verified: ${KEY} (${REMOTE_SIZE} bytes)"
echo "Retention is handled by the bucket's own lifecycle rule on the backups/ prefix (see docs/deployment/BACKUP_AND_RESTORE.md) -- this script does not delete anything."
echo "Done. $(date -u +%Y-%m-%dT%H:%M:%SZ)"
