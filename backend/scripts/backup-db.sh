#!/usr/bin/env bash
# WP-8 — nightly Neon backup to Cloudflare R2.
# Requires: pg_dump (matching or newer than the server's major version) + aws-cli.
# Env required: DATABASE_URL_ADMIN (BYPASSRLS role — captures ALL orgs, not RLS-filtered),
#               R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
set -euo pipefail

for v in DATABASE_URL_ADMIN R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  if [ -z "${!v:-}" ]; then
    echo "❌ Missing required env var: $v" >&2
    exit 1
  fi
done

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILE="techbuilder-${TIMESTAMP}.dump"
KEY="backups/${FILE}"

echo "→ Dumping database (custom format, compressed)..."
pg_dump "$DATABASE_URL_ADMIN" --format=custom --no-owner --no-privileges --file="$FILE"
SIZE=$(du -h "$FILE" | cut -f1)
echo "✅ Dump complete: $FILE ($SIZE)"

echo "→ Uploading to R2: s3://${R2_BUCKET}/${KEY}"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
aws s3 cp "$FILE" "s3://${R2_BUCKET}/${KEY}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "✅ Uploaded: ${KEY}"
rm -f "$FILE"

# Retention: a 14-day R2 Lifecycle Rule on the "backups/" prefix handles deletion
# (configured once in the Cloudflare dashboard — see docs/techBuilder-Backend-and-Database.md).
echo "BACKUP_KEY=${KEY}" >> "${GITHUB_ENV:-/dev/null}" 2>/dev/null || true
echo "🏁 Done. Object key: ${KEY}"
