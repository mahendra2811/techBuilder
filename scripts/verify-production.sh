#!/usr/bin/env bash
# Runs the checkable subset of docs/deployment/DAY_0_TO_40_PLAN.md's verification checklist
# against a live deployment. Exits non-zero if anything fails -- safe to wire into
# scripts/deploy-backend.sh's health-check step or a post-deploy CI job.
#
# Usage:
#   ./scripts/verify-production.sh --api https://api.example.com --web https://app.example.com
#
# Everything here is read-only (GET requests + a deliberately-invalid login attempt to confirm
# error handling) -- safe to run repeatedly against production.
set -uo pipefail

API=""
WEB=""
FAILURES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --web) WEB="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; echo "      $2"; FAILURES=$((FAILURES + 1)); }

http_code() {
  # http_code <method> <url> [curl-extra-args...]
  local method="$1"; local url="$2"; shift 2
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 -X "$method" "$@" "$url"
}

if [ -n "$API" ]; then
  echo "--- Backend: ${API} ---"

  code=$(http_code GET "${API}/api/v1/health")
  [ "$code" = "200" ] && pass "liveness (/health) returns 200" || fail "liveness (/health) returns 200" "got HTTP $code"

  code=$(http_code GET "${API}/api/v1/health/ready")
  [ "$code" = "200" ] && pass "readiness (/health/ready) returns 200" || fail "readiness (/health/ready) returns 200" "got HTTP $code (DB may be unreachable, or endpoint not deployed yet)"

  http_url=$(echo "$API" | sed 's#^https://#http://#')
  code=$(http_code GET "${http_url}/api/v1/health")
  case "$code" in
    301|302|307|308) pass "plain HTTP redirects to HTTPS" ;;
    *) fail "plain HTTP redirects to HTTPS" "got HTTP $code from ${http_url} (expected a 3xx redirect)" ;;
  esac

  code=$(http_code GET "${API}/api/v1/dashboards/owner")
  [ "$code" = "401" ] && pass "unauthenticated protected route returns 401, not 200/500" || fail "unauthenticated protected route returns 401, not 200/500" "got HTTP $code"

  code=$(http_code POST "${API}/api/v1/auth/login" -H 'content-type: application/json' -d '{"orgCode":"nope","username":"nope","password":"nope","deviceId":"verify-script"}')
  case "$code" in
    401|404) pass "invalid login returns a clean 4xx error, not a 500" ;;
    *) fail "invalid login returns a clean 4xx error, not a 500" "got HTTP $code" ;;
  esac

  cors_header=$(curl -fsS --max-time 8 -H 'Origin: https://evil.example.com' -I "${API}/api/v1/health" 2>/dev/null | grep -i '^access-control-allow-origin:' || true)
  if echo "$cors_header" | grep -qi '\*'; then
    fail "CORS does not wildcard-reflect arbitrary origins" "response included: $cors_header"
  else
    pass "CORS does not wildcard-reflect arbitrary origins"
  fi
fi

if [ -n "$WEB" ]; then
  echo "--- Frontend: ${WEB} ---"

  code=$(http_code GET "${WEB}/" -L)
  [ "$code" = "200" ] && pass "root serves 200 (after any redirect)" || fail "root serves 200 (after any redirect)" "got HTTP $code"

  code=$(http_code GET "${WEB}/owner/home")
  case "$code" in
    302|307) pass "protected route without cookies redirects to /login" ;;
    *) fail "protected route without cookies redirects to /login" "got HTTP $code (expected 302/307)" ;;
  esac
fi

if [ -z "$API" ] && [ -z "$WEB" ]; then
  echo "Nothing to check -- pass --api and/or --web." >&2
  exit 1
fi

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "${FAILURES} check(s) failed."
  exit 1
fi
