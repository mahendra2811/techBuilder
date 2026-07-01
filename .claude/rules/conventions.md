# techBuilder — Engineering Conventions (FROZEN)

These are encoded in `@techbuilder/contracts` and must hold across backend + app. Pin them verbatim in any build prompt.

## Identity & data
- **IDs:** client-generated **UUIDv7** (`uuidv7()` / `expo-crypto`). Never serial/auto-increment. Supplied on create (offline-first) → makes creates idempotent with `onConflictDoNothing()`.
- **Money:** **integer paise** (`bigint` in DB, `number` in TS as `Paise`). Never float. Format only at the display edge (₹, lakh/crore).
- **Time:** store **UTC `timestamptz`** (Drizzle `timestamp({ withTimezone: true })` → JS `Date` → `.toISOString()` in domain). **Business day** = `date` column = `YYYY-MM-DD` string in **Asia/Kolkata**. All "today" logic uses the local business date. Org-configurable EOD cutoff (default `20:00`).
- **Soft-delete:** every business table has `deletedAt`; all reads filter `isNull(deletedAt)`. Financial entries (expense) also carry a `void` flag. Hard-delete only unsynced client drafts.
- **Versioning:** every business row has `version int` for last-write-wins.

## Multi-tenancy / RLS
- Every tenant table has `org_id`. The backend sets tenant context **per transaction** via `DbService.runInTenant(orgId, fn)` → `select set_config('app.org_id', $orgId, true)`.
- RLS: `ENABLE` + **`FORCE ROW LEVEL SECURITY`** + a `tenant_isolation` policy (`org_id = app_current_org()`). The app connects as a **non-superuser, non-BYPASSRLS** role. Keep manual `org_id`/scope filters too (defense-in-depth).
- Login can't read `users` under RLS (no org yet) → uses the **SECURITY DEFINER `auth_lookup(username)`** function (`backend/sql/auth.sql`).

## Contracts boundary
- **`@techbuilder/contracts` is the single source of truth** for enums, DTO/zod types, `OrgConfig`, Drizzle schema, REST `ENDPOINTS`, and adapter interfaces. **Never redefine** any of these elsewhere.
- The schema is imported as `import * as schema from '@techbuilder/contracts/db/schema'`. Everything else from `@techbuilder/contracts`.
- Frontend **screens import only the adapter interfaces** — never axios/fetch/RestClient/DB directly.

## Errors & sync
- Uniform envelope: `{ error: { code, message, fields?, traceId } }` (success `{ data, meta? }`). `ErrorCode` enum is frozen. Map codes → localized messages on the client.
- Sync conflicts: **LWW** (by `version`/server time) for normal logs; **REJECT** conflicts on approvals / auth / identity changes. Outbox events are idempotent (idempotency key); exponential backoff, cap ~8.

## i18n
- Hindi-first + English via i18next. Zero hardcoded UI strings — all via keys. ₹ + `dd MMM yyyy` formatting via one util.

## Tooling
- npm workspace (single hoisted `drizzle-orm` — avoids duplicate-instance type clashes). TypeScript strict.
- Passwords: Node `crypto.scrypt` (no native build) — documented deviation from argon2id.
