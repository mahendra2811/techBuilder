# The Contracts Pack is FROZEN

`shared/` = `@techbuilder/contracts` is the **single source of truth** consumed by the backend (Prompt 1) and the frontend engine/screens (Prompts 2–3). Treat it as an API everyone depends on.

## Rules
- **Do not casually edit `shared/src/**`.** Enum/type/schema drift here breaks the whole build silently.
- A real change requires: (1) bump `shared/package.json` version (`1.0.0-frozen.N` → `N+1`), (2) note the change in `PROJECT_AI_CONTEXT.md` §0, (3) re-run `(cd shared && npm run typecheck)`, (4) re-typecheck `backend` (and `app` once it exists).
- **Never redefine** an enum/type/DTO/interface outside this package — import it.
- The DB schema lives at `shared/src/db/schema.ts`; RLS policy DDL at `shared/src/db/rls.sql` (applied after drizzle migrations — drizzle-kit does not emit `FORCE`/role DDL).
- Resolution-neutral on purpose: imports are **extensionless** (no `.js`) so both the CJS backend and the Metro/bundler frontend consume the source. Keep it that way.

## What's inside (see `shared/README.md`)
`common` (UUID/Paise/BusinessDate/Timestamp/audit/pagination) · `enums` (all `as const` arrays — TS unions + pgEnums derive from these) · `errors` (envelope + codes) · `config` (`OrgConfig` zod) · `domain` (entity + derived read models) · `dto` (create/mutation inputs) · `api` (`ENDPOINTS`) · `adapters` (`AuthClient`/`RecordsClient`/`SyncClient`) · `permissions` (RBAC matrix + `can()`) · `db/schema.ts` + `db/rls.sql`.

## A hook reminds you
`.claude/hooks/guard-frozen-contracts.sh` prints a (non-blocking) reminder when you Edit/Write under `shared/src`.
