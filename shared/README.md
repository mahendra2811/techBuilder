# @techbuilder/contracts — Contracts Pack (Prompt 0) 🔒 FROZEN

This package is the **single source of truth** for the techBuilder build. Backend (Prompt 1), frontend engine (Prompt 2), and frontend screens (Prompt 3) all import from here and **must not redefine** any enum, type, schema, or interface.

**Version:** `1.0.0-frozen.1` — frozen 2026-06-30. Changing anything here requires a version bump + a note in `PROJECT_AI_CONTEXT.md`.

## What's inside (`src/`)
| File | Contents |
|---|---|
| `common.ts` | UUIDv7 / Paise / BusinessDate / Timestamp types, audit fields, pagination, date window |
| `enums.ts` | All canonical enums as `as const` arrays (TS unions + pgEnums derive from these) |
| `errors.ts` | Uniform error envelope `{ error: { code, message, fields?, traceId } }` + response types |
| `config.ts` | `OrgConfig` zod schema + `parseOrgConfig()` (config is data, validated loudly) |
| `domain.ts` | Domain entity read models + derived models (WageSummary, Reconciliation, OwnerDashboard) |
| `dto.ts` | Input DTOs for every create/mutation (client supplies UUIDv7 `id`) |
| `api.ts` | REST endpoint registry (`/api/v1`, method+path) — RestClient + backend routes stay in lockstep |
| `adapters.ts` | `AuthClient` / `RecordsClient` / `SyncClient` interfaces — **the inviolable screen boundary** |
| `permissions.ts` | RBAC matrix + `can()` (client advisory) / `scopeFor()` (server authoritative) |
| `db/schema.ts` | Drizzle Postgres schema — all tables + indexes (structural truth) |
| `db/rls.sql` | RLS migration — ENABLE + **FORCE** + tenant-isolation policy + app-role notes (apply after drizzle migrations) |

## The non-negotiables (pinned in every downstream prompt)
1. **IDs:** client-generated **UUIDv7**. 2. **Money:** integer **paise**. 3. **Time:** UTC `timestamptz` + Asia/Kolkata business day. 4. **Soft-delete + `version`** (LWW). 5. **RLS:** per-tx `SET LOCAL app.org_id` + `FORCE ROW LEVEL SECURITY` + non-superuser app role. 6. **Adapter boundary:** screens use interfaces only. 7. **No enum/type redefinition** outside this package. 8. **Sync:** LWW for logs, **reject** conflicts on approvals/auth/identity; idempotent outbox.

## Freeze verification
```
cd shared && npm install && npm run typecheck   # must pass before Prompt 1
```
Once green, this package is FROZEN and copied/referenced verbatim into Prompts 1→3.
