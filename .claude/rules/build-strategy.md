# Build Strategy — Contracts-first + 3 prompts + model tiers

Full detail: `techBuilder-Roadmap.md`. Summary for quick recall:

## The 8 steps
0. **Contracts Pack** (FROZEN first) — ✅ done (`shared/`).
1. **Backend** (NestJS+Drizzle+RLS) — ✅ code-complete (`backend/`). Remaining: DB verification.
2. **Frontend engine** (Expo: adapters mock+rest, outbox/sync, expo-sqlite, i18n, config loader, ui, `can()`) — ⏭️ NEXT.
3. **Frontend screens** (Expo Router per role; "Today" hub; kiosk; dashboards; capture; export) — on the mock adapter first.
4. **Integration** (mock → rest).
5. **Hardening & QA** (offline-sync stress, RLS cross-tenant, low-end Android perf).
6. **First-merchant onboarding & pilot.**
7. **Production-ready / ship + reflect** (promote reusable bits into the engine).

## Why this shape
Freezing the Contracts Pack first lets cheaper models build the rest against a fixed spec without drift. Split on the **adapter boundary** so frontend builds/tests on mocks before the backend is wired.

## Model tiers (token optimization)
- **Opus** where errors propagate: STEP 0 contracts, auth/RLS/tenant core, wage/dashboards/reconciliation/sync, STEP 5 audits, adversarial reviews, integration of agent output.
- **Sonnet** for the bulk that follows the frozen contract: most backend CRUD modules, most screens, integration, routine tests. **Fan out as parallel subagents** (disjoint folders) for high-volume steps (backend CRUD ✅ proven; STEP 3 screens next).
- **Haiku** for trivial/high-volume/low-risk (simple list/form screens, config, ops).
- **Pattern that worked:** parallel Sonnet agents write disjoint module folders → Opus wires the central file (`app.module.ts`) + runs one typecheck + fixes. ~42 files generated, only 3 tiny fixes.

## Apply in Claude Code
`/model` to switch · `/fast` (Opus, faster) for interactive · Agent tool `model:` per subagent · Workflow per-phase model. Run STEP 3 (screens) as parallel Sonnet subagents scoped to the contracts + the engine's screen pattern; escalate only the hard screens (dashboards/kiosk/wage) to Opus.
