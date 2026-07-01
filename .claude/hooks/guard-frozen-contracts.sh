#!/usr/bin/env bash
# techBuilder PreToolUse hook (Edit|Write). NON-BLOCKING reminder when touching the FROZEN contracts.
# Always exits 0 — never blocks an edit. Just surfaces a reminder in the transcript.
set -euo pipefail
input="$(cat 2>/dev/null || true)"
# crude path extraction (no jq dependency)
path="$(printf '%s' "$input" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:"([^"]*)"/\1/')"
case "$path" in
  */shared/src/*)
    echo "⚠️  FROZEN CONTRACTS: editing @techbuilder/contracts ($path)." >&2
    echo "    This is the single source of truth for backend + app. If this is a real change:" >&2
    echo "    bump shared/package.json version, note it in docs/PROJECT_AI_CONTEXT.md §0, then re-run" >&2
    echo "    (cd shared && npm run typecheck) and re-typecheck backend. See .claude/rules/contracts-frozen.md" >&2
    ;;
esac
exit 0
