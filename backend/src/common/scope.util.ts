/**
 * WP-1 — server-side RBAC SCOPE enforcement.
 *
 * The boolean `can(role, action)` check in RbacGuard says WHETHER a role may perform an
 * action; this module enforces WHERE it may perform it (ORG / OWN_SITE / OWN_CREW /
 * OWN_VEHICLE / SELF), as promised by the Spec §4 matrix. Scope is derived FRESH from the
 * DB inside the tenant tx — never from JWT claims.
 *
 * RLS isolates the org; these filters isolate the role within the org (defense-in-depth).
 */
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { scopeFor, type Action, type Role, type Scope } from '@techbuilder/contracts';
import { ApiException } from './api-exception';
import type { Principal } from './current-user.decorator';
import type { Tx } from '../db/db.service';

export interface ScopeContext {
  userId: string;
  /** Role fresh from the DB (JWT role could be stale after a role change). */
  role: Role;
  personId: string | null;
  /** SM: assigned + managed sites · TH: crew sites · DRIVER: own vehicles' sites · WORKER: assigned site. */
  siteIds: string[];
  /** TH: own crews · SM: crews at own sites. */
  crewIds: string[];
  /** Members of `crewIds` (for SM this equals "persons at my sites"). */
  crewPersonIds: string[];
  /** DRIVER: vehicles assigned to my person. */
  vehicleIds: string[];
}

const uniq = (xs: Array<string | null | undefined>): string[] => [...new Set(xs.filter((x): x is string => !!x))];

/** `col IN (ids)` that is FALSE (not a syntax error / not a full-table match) on an empty set. */
export function inSet(col: AnyColumn, ids: string[]): SQL {
  return ids.length ? (inArray(col, ids) as SQL) : sql`false`;
}

export function forbidScope(message: string): never {
  throw new ApiException('FORBIDDEN', message);
}

/** Load the caller's scope fresh from the DB (inside the tenant tx). */
export async function loadScope(tx: Tx, p: Principal): Promise<ScopeContext> {
  const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, p.userId));
  if (!u || !u.active || u.deletedAt) forbidScope('User is inactive or missing');

  const ctx: ScopeContext = {
    userId: u.id,
    role: u.role,
    personId: u.personId ?? null,
    siteIds: [],
    crewIds: [],
    crewPersonIds: [],
    vehicleIds: [],
  };
  if (u.role === 'OWNER') return ctx; // ORG scope everywhere — no sets needed

  if (u.role === 'SITE_MANAGER') {
    const managed = await tx
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(and(isNull(schema.sites.deletedAt), eq(schema.sites.siteManagerId, u.id)));
    ctx.siteIds = uniq([u.assignedSiteId, ...managed.map((s) => s.id)]);
    if (ctx.siteIds.length) {
      const crews = await tx
        .select({ id: schema.crews.id })
        .from(schema.crews)
        .where(and(isNull(schema.crews.deletedAt), inSet(schema.crews.siteId, ctx.siteIds)));
      ctx.crewIds = crews.map((c) => c.id);
    }
  } else if (u.role === 'SUPERVISOR') {
    const led = await tx
      .select({ id: schema.crews.id, siteId: schema.crews.siteId })
      .from(schema.crews)
      .where(and(isNull(schema.crews.deletedAt), eq(schema.crews.supervisorUserId, u.id)));
    ctx.crewIds = uniq([u.crewId, ...led.map((c) => c.id)]);
    ctx.siteIds = uniq([u.assignedSiteId, ...led.map((c) => c.siteId)]);
  } else if (u.role === 'ACCOUNTANT') {
    // Round 2: per-site money desk — mirrors the SM pattern on sites.accountantId.
    const managed = await tx
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(and(isNull(schema.sites.deletedAt), eq(schema.sites.accountantId, u.id)));
    ctx.siteIds = uniq([u.assignedSiteId, ...managed.map((s) => s.id)]);
  } else if (u.role === 'DRIVER') {
    if (u.personId) {
      const vs = await tx
        .select({ id: schema.vehicles.id, siteId: schema.vehicles.assignedSiteId })
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, u.personId)));
      ctx.vehicleIds = vs.map((v) => v.id);
      ctx.siteIds = uniq(vs.map((v) => v.siteId));
    }
  } else {
    // WORKER
    ctx.siteIds = uniq([u.assignedSiteId]);
  }

  if (ctx.crewIds.length) {
    const members = await tx
      .select({ personId: schema.crewMembers.personId })
      .from(schema.crewMembers)
      .where(inSet(schema.crewMembers.crewId, ctx.crewIds));
    ctx.crewPersonIds = uniq(members.map((m) => m.personId));

    // Round 2: crews now include DRIVERS (linked via users.crewId). Fold crew drivers into the
    // person set, and give the SUPERVISOR reach over his crew drivers' vehicles.
    const crewDrivers = await tx
      .select({ personId: schema.users.personId })
      .from(schema.users)
      .where(
        and(isNull(schema.users.deletedAt), eq(schema.users.role, 'DRIVER'), inSet(schema.users.crewId, ctx.crewIds)),
      );
    const driverPersonIds = uniq(crewDrivers.map((d) => d.personId));
    if (driverPersonIds.length) {
      ctx.crewPersonIds = uniq([...ctx.crewPersonIds, ...driverPersonIds]);
      if (u.role === 'SUPERVISOR') {
        const vs = await tx
          .select({ id: schema.vehicles.id, siteId: schema.vehicles.assignedSiteId })
          .from(schema.vehicles)
          .where(and(isNull(schema.vehicles.deletedAt), inSet(schema.vehicles.assignedDriverPersonId, driverPersonIds)));
        ctx.vehicleIds = uniq([...ctx.vehicleIds, ...vs.map((v) => v.id)]);
        ctx.siteIds = uniq([...ctx.siteIds, ...vs.map((v) => v.siteId)]);
      }
    }
  }
  return ctx;
}

function scopeOf(ctx: ScopeContext, action: Action): Scope {
  const s = scopeFor(ctx.role, action);
  if (s === 'NONE') forbidScope(`Role ${ctx.role} cannot ${action}`);
  return s;
}

/** WRITE guard: may the caller act on this site? */
export function assertSiteInScope(ctx: ScopeContext, action: Action, siteId: string): void {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return;
  if ((s === 'OWN_SITE' || s === 'OWN_CREW' || s === 'OWN_VEHICLE') && ctx.siteIds.includes(siteId)) return;
  forbidScope(`Site out of ${s} scope for ${action}`);
}

/** WRITE guard: may the caller act on this person (attendance / leave)? */
export function assertPersonInScope(ctx: ScopeContext, action: Action, personId: string): void {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return;
  if ((s === 'OWN_SITE' || s === 'OWN_CREW') && ctx.crewPersonIds.includes(personId)) return;
  if (s === 'SELF' && ctx.personId && personId === ctx.personId) return;
  forbidScope(`Person out of ${s} scope for ${action}`);
}

/** WRITE guard: may the caller act on this vehicle? (async: SM needs the vehicle's site) */
export async function assertVehicleInScope(tx: Tx, ctx: ScopeContext, action: Action, vehicleId: string): Promise<void> {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return;
  if (s === 'OWN_VEHICLE') {
    if (ctx.vehicleIds.includes(vehicleId)) return;
    forbidScope('Vehicle is not assigned to you');
  }
  if (s === 'OWN_SITE' || s === 'OWN_CREW') {
    const [v] = await tx
      .select({ siteId: schema.vehicles.assignedSiteId })
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.deletedAt)));
    if (v?.siteId && ctx.siteIds.includes(v.siteId)) return;
    forbidScope(`Vehicle out of ${s} scope for ${action}`);
  }
  forbidScope(`Vehicle out of scope for ${action}`);
}

/** READ filter for a site-stamped column: undefined = unfiltered (ORG). */
export function siteReadFilter(ctx: ScopeContext, action: Action, col: AnyColumn): SQL | undefined {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return undefined;
  if (s === 'SELF') return sql`false`;
  return inSet(col, ctx.siteIds);
}

/** READ filter for a person-stamped column (attendance / leave). */
export function personReadFilter(ctx: ScopeContext, action: Action, col: AnyColumn): SQL | undefined {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return undefined;
  if (s === 'OWN_SITE' || s === 'OWN_CREW') return inSet(col, ctx.crewPersonIds);
  // SELF / OWN_VEHICLE → own person rows only (drivers see their own attendance)
  return ctx.personId ? (eq(col, ctx.personId) as SQL) : sql`false`;
}

/** READ filter for a vehicle-stamped column (fuel / vehicle-log / trip). */
export function vehicleReadFilter(tx: Tx, ctx: ScopeContext, action: Action, col: AnyColumn): SQL | undefined {
  const s = scopeOf(ctx, action);
  if (s === 'ORG') return undefined;
  if (s === 'OWN_VEHICLE') return inSet(col, ctx.vehicleIds);
  if (s === 'OWN_SITE') {
    const sq = tx
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(and(isNull(schema.vehicles.deletedAt), inSet(schema.vehicles.assignedSiteId, ctx.siteIds)));
    return inArray(col, sq) as SQL;
  }
  // OWN_CREW / SELF have no vehicle scope → only rows they created (caller composes) or nothing
  return sql`false`;
}

/** READ filter: rows the caller entered themselves. */
export function selfEnteredFilter(ctx: ScopeContext, col: AnyColumn): SQL {
  return eq(col, ctx.userId) as SQL;
}

/** True if the caller's fresh role is OWNER. */
export function isOwner(ctx: ScopeContext): boolean {
  return ctx.role === 'OWNER';
}
