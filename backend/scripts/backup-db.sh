#!/usr/bin/env bash
# WP-8 — nightly Neon backup to Cloudflare R2.
# Requires: Docker (runs pg_dump via the official `postgres` image — always an EXACT major-version
#           match to Neon, no apt/PGDG/PATH version-mismatch fragility) + aws-cli.
# Env required: DATABASE_URL_ADMIN (BYPASSRLS role — captures ALL orgs, not RLS-filtered),
#               R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
#               PG_MAJOR (optional, default 18 — bump when Neon upgrades its Postgres major version)
set -euo pipefail

for v in DATABASE_URL_ADMIN R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  if [ -z "${!v:-}" ]; then
    echo "❌ Missing required env var: $v" >&2
    exit 1
  fi
done
PG_MAJOR="${PG_MAJOR:-18}"

TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILE="techbuilder-${TIMESTAMP}.dump"
KEY="backups/${FILE}"

echo "→ Dumping database via postgres:${PG_MAJOR} image (custom format)..."
# Runs as the image's default (root) user — passing --user <host-uid> breaks pg_dump's
# internal getpwuid() lookup (for ~/.pgpass) when that uid has no /etc/passwd entry in the
# container. The resulting file is root-owned but world-readable (default umask) and
# deletable regardless (unlink only needs write access to the containing directory).
docker run --rm -v "$(pwd)":/workdir -w /workdir "postgres:${PG_MAJOR}" \
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
