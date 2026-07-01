---
name: resume-techbuilder
description: Re-orient on the techBuilder project at the start of a session — read the key docs + build status and report where the build is and the precise next step. Use when the user says "resume", "where were we", "continue techBuilder", "what's the status", or starts a fresh session on this repo.
---

# Resume techBuilder

Goal: get fully oriented and tell the user exactly where the build is and what's next — without guessing.

## Steps
1. Read **`CLAUDE.md`** (this repo root) and **`docs/PROJECT_AI_CONTEXT.md` §0** (current direction + locked-decisions table + 🏗️ Build status). §§1–12 of PROJECT_AI_CONTEXT are superseded research — skim only if needed.
2. Read **`docs/techBuilder-Build-Readiness-Spec.md`** (authoritative build contract) and **`docs/techBuilder-Roadmap.md`** (8 steps + model strategy).
3. Verify current state with cheap checks (do NOT rebuild):
   - `(cd shared && npm run typecheck)` — contracts still green?
   - `(cd backend && npm run typecheck)` — backend still green?
   - `find backend/src -maxdepth 1 -type d` — confirm the 16 modules.
4. Check the auto-memory note `techbuilder-phase1-direction` (loaded via MEMORY.md) for the latest running state + any deviations.
5. **Report:** one short paragraph — what's DONE (STEP 0 frozen, STEP 1 code-complete), what's the immediate next action (per Build status), and any blockers (e.g. needs a `DATABASE_URL` to close STEP 1's DB verification; STEP 2 frontend engine is the chosen next track and needs no infra).

## Guardrails
- Do not edit `shared/src/**` without following `.claude/rules/contracts-frozen.md`.
- For any new backend module, follow `.claude/rules/backend-modules.md` (the `sites/` pattern).
- Keep the build status in `docs/PROJECT_AI_CONTEXT.md` §0 + the auto-memory current after working.
