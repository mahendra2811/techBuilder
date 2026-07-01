# Adding a Backend Module (the `sites/` pattern)

Every backend resource module mirrors `backend/src/sites/` exactly. Read those 3 files first; then copy the shape.

## Files (per module `backend/src/<name>/`)
- `<name>.service.ts` — `@Injectable`, `constructor(private readonly dbs: DbService)`.
- `<name>.controller.ts` — `@UseGuards(JwtAuthGuard, RbacGuard)`, `@RequireAction(...)`, `@CurrentUser() u: Principal`, `ZodBody`.
- `<name>.module.ts` — standard NestJS module. **Then register it in `backend/src/app.module.ts`.**

## Service rules
- Every method body: `return this.dbs.runInTenant(u.orgId, async (tx) => { ... })` (RLS-scoped tx).
- **Create:** insert with the client-supplied `input.id`, `.onConflictDoNothing().returning()`; if no row returned, fallback-select by id (idempotent replay); else `throw new ApiException('CONFLICT', ...)`.
- **Map rows → contracts domain type** via a local `mapXxx()`: `Date → .toISOString()`, `?? null`, `?? []`. `createdBy/updatedBy = u.userId` on writes.
- **List:** return a **plain domain array** (not Paginated — the RestClient adapts), `where(isNull(deletedAt))`, `orderBy(desc(createdAt))`. Don't add per-site filtering unless the method signature passes `siteId`/`window` (RLS already isolates the org).
- **Upsert** (attendance/vehicle-log): `.onConflictDoUpdate({ target: [<unique cols>], set: {...} })`.
- Throw `ApiException(code, message, fields?)` for all errors (the global filter renders the envelope).
- Guard `noUncheckedIndexedAccess`: after `const [row] = await ...`, `row` is `T | undefined` — guard it.

## Controller rules
- Paths EXACTLY match `shared/src/api.ts` `ENDPOINTS`.
- `@RequireAction('<action>')` per the RBAC matrix (`shared/src/permissions.ts`). Endpoints with no action = any authenticated user (notifications, media presign).
- Validate every body with `new ZodBody(<zodSchema>)` — write a zod schema matching the DTO.

## RBAC action mapping (note: `ACTIONS` is frozen; reuse pragmatically)
`user.create` → users + people · `site.manage` → sites · `vehicle.manage` → vehicle-types + vehicles · `attendance.mark` → attendance + leave · `record.enter` → progress/expense/material/issue + record update/void · `vehicleLog.enter` → fuel/vehicle-log/trip · `request.submit`/`request.decide` → approvals · `wage.view` → wage summary + advances · `config.manage` → wage-rate set + config · `view.all` → reads/lists/dashboards/reports · `report.export` → exports.

## Imports
```ts
import { eq, and, isNull, desc, gte, lte, sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { /* domain + dto types */ } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
```

## Parallelizing (token strategy)
Mechanical CRUD modules → fan out as **parallel Sonnet subagents**, each scoped to **disjoint module folders** (do NOT let them touch `app.module.ts`/`db`/`common`/`auth`/`shared`). Then **wire `app.module.ts` + run `npm run typecheck` centrally** and fix. Logic-heavy modules (wage/dashboards/recon/sync/users) → Opus.

## Verify
`(cd backend && npm run typecheck)` must be clean before considering a module done.
