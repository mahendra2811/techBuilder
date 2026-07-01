---
name: new-backend-module
description: Scaffold a new NestJS backend resource module for techBuilder following the proven sites/ pattern (tenant-scoped runInTenant, idempotent UUID inserts, mapXxx, scoped RBAC, ApiException, ZodBody). Use when adding/extending a backend module under backend/src, or when the user says "add a backend module", "new resource endpoint", or names a RecordsClient method that has no endpoint yet.
---

# New Backend Module (techBuilder)

Build a resource module that mirrors `backend/src/sites/` exactly and typechecks against the frozen `@techbuilder/contracts`.

## Procedure
1. **Read first:** `backend/src/sites/{sites.service,sites.controller,sites.module}.ts`, `backend/src/db/db.service.ts`, `backend/src/common/{api-exception,current-user.decorator,rbac.guard,zod-body.pipe}.ts`, and the contract files `shared/src/{adapters,dto,domain,api,enums}.ts` + `shared/src/db/schema.ts`. Also read `.claude/rules/backend-modules.md` and `.claude/rules/conventions.md`.
2. **Identify** the adapter method(s) (from `adapters.ts`), the matching `ENDPOINTS` path(s) (from `api.ts`), the DB table(s) (from `db/schema.ts`), and the RBAC action(s) (mapping in `backend-modules.md`).
3. **Write** `backend/src/<name>/<name>.{service,controller,module}.ts` following the sites pattern:
   - Service: `runInTenant` per method; idempotent create (`onConflictDoNothing().returning()` + fallback select); local `mapXxx()` (`Date→toISOString`, `?? null`/`?? []`); `ApiException` on errors; guard `const [row]` for `undefined`.
   - Controller: `@UseGuards(JwtAuthGuard, RbacGuard)`, `@RequireAction(...)`, `@CurrentUser() u: Principal`, `ZodBody` schema per DTO; paths EXACTLY per `api.ts`.
4. **Register** the module in `backend/src/app.module.ts` (imports array).
5. **Verify:** `(cd backend && npm run typecheck)` clean. Fix any type errors (common: `noUncheckedIndexedAccess` on `[row]`, jsonb casts, missing imports).

## Parallelizing several modules
For many mechanical modules, spawn **parallel Sonnet subagents** (Agent tool, `model: 'sonnet'`), each scoped to disjoint module folders with the rules above; tell them NOT to touch `app.module.ts`/`db`/`common`/`auth`/`shared`. Then wire `app.module.ts` + typecheck centrally and fix. (Reserve logic-heavy modules — wage/dashboards/reconciliation/sync/users — for Opus.)

## Do NOT
- Edit `shared/src/**` (frozen contracts) — import from it.
- Return `Paginated` from list endpoints — return plain domain arrays (the RestClient adapts).
- Add per-site filtering on lists unless the signature passes `siteId`/`window` (RLS isolates the org).
