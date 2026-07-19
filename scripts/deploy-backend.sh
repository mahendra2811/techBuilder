#!/usr/bin/env bash
# Zero-downtime-ish deploy: build locally (never on the small EC2 box — t4g.micro, 1GB RAM in
# Phase 1), ship the artifact, swap a release symlink atomically, restart via systemd, verify,
# auto-rollback on failed health check.
#
# Despite the filename (kept to match the requested deliverable list), this deploys EITHER
# workspace via --app:
#
#   ./scripts/deploy-backend.sh --app backend --host ec2-user@<ec2-host-or-ip>
#   ./scripts/deploy-backend.sh --app web     --host ec2-user@<ec2-host-or-ip>   # Phase 2 only
#
# Assumes: passwordless SSH (key-based) to --host, the target systemd unit
# (techbuilder-backend.service / techbuilder-web.service) already installed (see
# docs/deployment/PRODUCTION_DEPLOYMENT.md), and /opt/techbuilder/<app>/.env already in place on
# the server (this script never touches secrets).
set -euo pipefail

APP=""
HOST=""
RELEASES_TO_KEEP=5
SKIP_HEALTHCHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --keep) RELEASES_TO_KEEP="$2"; shift 2 ;;
    --skip-healthcheck) SKIP_HEALTHCHECK=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ "$APP" != "backend" ] && [ "$APP" != "web" ]; then
  echo "Usage: $0 --app backend|web --host user@host [--keep N] [--skip-healthcheck]" >&2
  exit 1
fi
if [ -z "$HOST" ]; then
  echo "Missing --host" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ID=$(date -u +%Y%m%d%H%M%S)
REMOTE_BASE="/opt/techbuilder/${APP}"
REMOTE_RELEASE="${REMOTE_BASE}/releases/${RELEASE_ID}"
SERVICE="techbuilder-${APP}"
STAGE_DIR=$(mktemp -d)
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> Building shared contracts (dependency of both workspaces)"
(cd "$REPO_ROOT" && npm run build --workspace=shared)

if [ "$APP" = "backend" ]; then
  echo "==> Building backend"
  (cd "$REPO_ROOT" && npm run build --workspace=backend)
  echo "==> Staging release artifact (dist + package.json + node_modules, prod deps only)"
  mkdir -p "$STAGE_DIR/backend"
  cp -r "$REPO_ROOT/backend/dist" "$STAGE_DIR/backend/dist"
  cp "$REPO_ROOT/backend/package.json" "$STAGE_DIR/backend/package.json"
  cp -r "$REPO_ROOT/backend/node_modules" "$STAGE_DIR/backend/node_modules"
  # No native deps in this project's dependency tree (verified during the 2026-07-11 audit — pure
  # JS pg/drizzle/nodemailer/exceljs, scrypt-based password hashing) — a node_modules built on the
  # developer's own machine is binary-compatible with the ARM64 EC2 box. If that ever changes,
  # switch this step to `npm ci --omit=dev` run over SSH on the server instead.
  ARTIFACT_LOCAL_PATH="$STAGE_DIR/backend"
else
  echo "==> Building web (standalone output for self-hosting)"
  (cd "$REPO_ROOT/web" && NEXT_OUTPUT_STANDALONE=1 npm run build)
  echo "==> Staging standalone bundle + static assets"
  mkdir -p "$STAGE_DIR/web"
  cp -r "$REPO_ROOT/web/.next/standalone/." "$STAGE_DIR/web/"
  cp -r "$REPO_ROOT/web/public" "$STAGE_DIR/web/public"
  mkdir -p "$STAGE_DIR/web/.next/static"
  cp -r "$REPO_ROOT/web/.next/static/." "$STAGE_DIR/web/.next/static/"
  ARTIFACT_LOCAL_PATH="$STAGE_DIR/web"
fi

echo "==> Creating release directory on ${HOST}"
ssh "$HOST" "mkdir -p '${REMOTE_RELEASE}'"

echo "==> Uploading release ${RELEASE_ID} to ${HOST}:${REMOTE_RELEASE}"
rsync -az --delete "${ARTIFACT_LOCAL_PATH}/" "${HOST}:${REMOTE_RELEASE}/"

PREVIOUS_RELEASE=$(ssh "$HOST" "readlink -f '${REMOTE_BASE}/current' 2>/dev/null || true")

if [ "$APP" = "backend" ]; then
  echo ""
  echo "NOTE: this script does NOT run migrations -- the deployed artifact ships only dist/ +"
  echo "node_modules (no drizzle-kit config/source), and migrations should run against RDS"
  echo "deliberately, as a reviewed step, before code that depends on the new schema goes live."
  echo "If this release includes a new migration, run it FIRST from your own machine:"
  echo "  (cd backend && npm run db:deploy)   # = db:migrate THEN db:rls (defaults to DATABASE_URL_ADMIN)"
  echo "against the production RDS instance, then re-run this deploy. See docs/deployment/DATABASE_MIGRATION.md."
  echo "IMPORTANT: use db:deploy (not bare db:migrate) so RLS + CHECK constraints are (re)applied to any"
  echo "new tables — the backend now refuses to start in production if a tenant table is missing RLS."
  echo ""
fi

echo "==> Swapping release symlink"
ssh "$HOST" "ln -sfn '${REMOTE_RELEASE}' '${REMOTE_BASE}/current'"

echo "==> Restarting ${SERVICE}"
ssh "$HOST" "sudo systemctl restart ${SERVICE}"

if [ "$SKIP_HEALTHCHECK" -ne 1 ]; then
  echo "==> Waiting for health check"
  sleep 3
  HEALTH_URL="http://localhost:$( [ "$APP" = "backend" ] && echo 4000/api/v1/health || echo 3000/)"
  if ! ssh "$HOST" "curl -fsS --max-time 5 '${HEALTH_URL}' >/dev/null"; then
    echo "Health check FAILED -- rolling back to previous release." >&2
    if [ -n "$PREVIOUS_RELEASE" ]; then
      ssh "$HOST" "ln -sfn '${PREVIOUS_RELEASE}' '${REMOTE_BASE}/current' && sudo systemctl restart ${SERVICE}"
      echo "Rolled back to ${PREVIOUS_RELEASE}." >&2
    else
      echo "No previous release to roll back to -- manual intervention needed." >&2
    fi
    exit 1
  fi
  echo "Health check passed."
fi

echo "==> Pruning old releases (keeping last ${RELEASES_TO_KEEP})"
ssh "$HOST" "cd '${REMOTE_BASE}/releases' && ls -1t | tail -n +$((RELEASES_TO_KEEP + 1)) | xargs -r rm -rf"

echo "Deploy of ${APP} release ${RELEASE_ID} complete."
