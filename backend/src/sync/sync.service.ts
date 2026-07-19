import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@techbuilder/contracts/db/schema';
import { can, type Action, type SyncEvent, type SyncResult } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import {
  assertPersonInScope,
  assertSiteInScope,
  assertVehicleInScope,
  forbidScope,
  loadScope,
  type ScopeContext,
} from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';
import { ATTENDANCE_BACKDATE_LIMIT_DAYS, RECORD_CREATE_BACKDATE_LIMIT_DAYS, assertBackdateWindow } from '../common/backdate.util';

/**
 * WP-1/WP-6 — the outbox accepts FIELD RECORDS only. Master data (sites, vehicles,
 * vehicle-types, people, wage-rates, advances) is managed through its own scoped endpoints;
 * letting it through here was a full RBAC bypass (any authenticated token could write any
 * table). Each event is re-checked exactly like its REST path: action + scope + attribution.
 */
const REGISTRY: Record<string, PgTable> = {
  attendance: schema.attendance,
  leave: schema.leaves,
  progress: schema.progressNotes,
  expense: schema.expenses,
  fuel: schema.fuelLogs,
  'vehicle-log': schema.vehicleLogs,
  trip: schema.trips,
  'material-txn': schema.materialTxns,
  issue: schema.issues,
};

const ACTION_OF: Record<string, Action> = {
  attendance: 'attendance.mark',
  leave: 'attendance.mark',
  progress: 'record.enter',
  expense: 'record.enter',
  'material-txn': 'record.enter',
  issue: 'record.enter',
  fuel: 'vehicleLog.enter',
  'vehicle-log': 'vehicleLog.enter',
  trip: 'vehicleLog.enter',
};

/**
 * Server-owned columns a client sync payload must NEVER supply — stripped on CREATE and UPDATE.
 * Letting these through was a two-tick money bypass: a crafted `expense` event could arrive
 * already `verifiedAt`/`flagged:false`/`void:false` (a self-verified, immutable spend with no
 * accountant tick), a `fuel` event `status:'CONFIRMED'` (faking the diesel match), or a
 * `material-txn` `finalized:true` (a driver pick masquerading as a supervisor-final record).
 * Such state is only ever set by the dedicated server paths (decide, verify, void, the diesel
 * matcher, resolve), never by the writer.
 *
 * PER-ENTITY on purpose: `status` is server-owned match state for fuel/material-txn, but it is the
 * CORE user datum for attendance (PRESENT/ABSENT) — a blanket strip broke attendance sync.
 */
const UNIVERSAL_STRIP = ['version', 'createdAt', 'updatedAt', 'deletedAt'] as const;
const SERVER_OWNED_BY_ENTITY: Record<string, readonly string[]> = {
  expense: ['verifiedBy', 'verifiedAt', 'flagged', 'flagNote', 'void'],
  fuel: ['status', 'matchedIssuanceId', 'matchedFuelLogId'],
  'material-txn': ['status', 'finalized', 'enteredRole'],
  issue: ['status', 'resolvedBy', 'resolutionNote', 'closingNote'], // resolve/close are server paths
};

function stripServerOwned(entityType: string, payload: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...payload };
  for (const k of UNIVERSAL_STRIP) delete clean[k];
  for (const k of SERVER_OWNED_BY_ENTITY[entityType] ?? []) delete clean[k];
  return clean;
}


@Injectable()
export class SyncService {
  constructor(private readonly dbs: DbService) {}

  /** Apply a batch of offline writes. Each event is independent (own tx) → partial success + idempotent replay. */
  async pushBatch(p: Principal, events: SyncEvent[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const ev of events) {
      try {
        await this.applyOne(p, ev);
        results.push({ outboxId: ev.outboxId, ok: true });
      } catch (e) {
        const code = e instanceof ApiException ? e.code : e instanceof Error ? e.message : 'INTERNAL';
        results.push({ outboxId: ev.outboxId, ok: false, errorCode: code });
      }
    }
    return results;
  }

  private async applyOne(p: Principal, ev: SyncEvent): Promise<void> {
    const table = REGISTRY[ev.entityType];
    const action = ACTION_OF[ev.entityType];
    if (!table || !action) throw new ApiException('NOT_FOUND', 'UNKNOWN_ENTITY');
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = table as any;

    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (!can(ctx.role, action)) forbidScope(`Role ${ctx.role} cannot ${action}`);
      await assertPayloadScope(tx, ctx, ev.entityType, action, payload);

      if (ev.op === 'CREATE') {
        // WP-4/Phase-4: queued creates obey the same backdating windows as the REST paths
        // (attendance map for attendance; record map for every businessDate-stamped record —
        // leave has no businessDate and is deliberately unwindowed).
        if (typeof payload['businessDate'] === 'string') {
          await assertBackdateWindow(
            tx,
            ctx.role,
            payload['businessDate'],
            ev.entityType === 'attendance' ? ATTENDANCE_BACKDATE_LIMIT_DAYS : RECORD_CREATE_BACKDATE_LIMIT_DAYS,
          );
        }
        // Strip any server-owned column the client tried to supply (verification/void/
        // match/finalized state) BEFORE spreading — closes the two-tick money bypass.
        const clean = stripServerOwned(ev.entityType, payload);
        const attribution: Record<string, unknown> = { orgId: p.orgId, createdBy: p.userId, updatedBy: p.userId };
        if (ev.entityType === 'attendance') attribution['markedBy'] = p.userId;
        if (ev.entityType === 'progress' || ev.entityType === 'expense') attribution['enteredBy'] = p.userId;
        // material-txn: the server sets finality from the writer's role (SUPERVISOR = final,
        // DRIVER pick = data-only), exactly like records.createMaterialTxn — never the client.
        if (ev.entityType === 'material-txn') {
          attribution['enteredRole'] = ctx.role;
          attribution['finalized'] = ctx.role !== 'DRIVER';
        }
        await tx
          .insert(table)
          .values({ ...clean, ...attribution } as never)
          .onConflictDoNothing();
      } else {
        // UPDATE / VOID: same WP-3 guard as the REST path — creator-only within the window,
        // Owner override, AND (like records.updateRecord) no edits once accountant-verified.
        await assertEditAllowed(tx, ctx, t, ev.entityType, payload['id'] as string);
        if (ev.op === 'UPDATE') {
          // Also drop the scope keys (siteId/vehicleId/personId): re-pointing a record to another
          // scope stays in-org so RLS won't stop it — same rule as records.updateRecord's
          // IMMUTABLE_PATCH_FIELDS. To move a record, void + re-create it.
          const {
            id: _id,
            orgId: _org,
            createdBy: _cb,
            enteredBy: _eb,
            markedBy: _mb,
            businessDate: _bd,
            siteId: _si,
            vehicleId: _vi,
            personId: _pi,
            ...rest
          } = stripServerOwned(ev.entityType, payload);
          await tx
            .update(table)
            .set({ ...rest, updatedBy: p.userId, updatedAt: new Date() } as never)
            .where(eq(t.id, payload['id'] as string));
        } else {
          await tx
            .update(table)
            .set({ deletedAt: new Date(), updatedBy: p.userId } as never)
            .where(eq(t.id, payload['id'] as string));
        }
      }
    });
  }

  /**
   * Incremental pull. Phase 1: screens read via the typed list endpoints, so this returns no deltas yet
   * (a real change-feed since `since` is a Phase-2 addition). Returns a fresh cursor.
   */
  async pull(_p: Principal, _since: string | null): Promise<{ changes: Array<{ entityType: string; rows: unknown[] }>; cursor: string }> {
    return { changes: [], cursor: new Date().toISOString() };
  }
}

/** Scope-check the payload's site/person/vehicle exactly like the REST create paths. */
async function assertPayloadScope(
  tx: Tx,
  ctx: ScopeContext,
  entityType: string,
  action: Action,
  payload: Record<string, unknown>,
): Promise<void> {
  const siteId = typeof payload['siteId'] === 'string' ? payload['siteId'] : undefined;
  const personId = typeof payload['personId'] === 'string' ? payload['personId'] : undefined;
  const vehicleId = typeof payload['vehicleId'] === 'string' ? payload['vehicleId'] : undefined;

  if (entityType === 'attendance') {
    if (!siteId || !personId) throw new ApiException('VALIDATION_FAILED', 'attendance requires siteId + personId');
    assertSiteInScope(ctx, action, siteId);
    if (ctx.role === 'SUPERVISOR') assertPersonInScope(ctx, action, personId);
    return;
  }
  if (entityType === 'leave') {
    if (!personId) throw new ApiException('VALIDATION_FAILED', 'leave requires personId');
    assertPersonInScope(ctx, action, personId);
    return;
  }
  if (entityType === 'fuel' || entityType === 'vehicle-log' || entityType === 'trip') {
    if (!vehicleId) throw new ApiException('VALIDATION_FAILED', `${entityType} requires vehicleId`);
    await assertVehicleInScope(tx, ctx, action, vehicleId);
    if (entityType === 'vehicle-log' && ctx.role === 'DRIVER' && payload['driverPersonId'] !== ctx.personId) {
      forbidScope('Drivers may only log for their own person');
    }
    return;
  }
  // progress / expense / material-txn / issue — site-stamped (issue may be vehicle-stamped)
  // SUP-9 (aligned to the web + records.createExpense, 2026-07-19): the SUPERVISOR never books an
  // expense directly through any channel — his spends are always EXPENSE_ADD requests the
  // accountant decides. Same guard as records.createExpense.
  if (entityType === 'expense' && ctx.role === 'SUPERVISOR') {
    throw new ApiException(
      'VALIDATION_FAILED',
      'Supervisors record spends as money requests — submit it for the accountant instead',
      { amountPaise: 'OVER_DIRECT_LIMIT' },
    );
  }
  if (siteId) assertSiteInScope(ctx, action, siteId);
  else if (vehicleId) await assertVehicleInScope(tx, ctx, action, vehicleId);
  else if (entityType !== 'issue') throw new ApiException('VALIDATION_FAILED', `${entityType} requires siteId`);
}

/** WP-3 (sync flavor): creator-only edit/void within business-day +1; Owner override. Mirrors
 *  records.assertEditAllowed, INCLUDING the two-tick rule: accountant-verified money is permanent. */
async function assertEditAllowed(
  tx: Tx,
  ctx: ScopeContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  entityType: string,
  id: string | undefined,
): Promise<void> {
  if (!id) throw new ApiException('VALIDATION_FAILED', 'payload.id required for update/void');
  const [row] = (await tx
    .select({
      createdBy: t.createdBy,
      businessDate: t.businessDate,
      deletedAt: t.deletedAt,
      // Only the expense family carries verification columns.
      ...(entityType === 'expense' ? { verifiedAt: t.verifiedAt } : {}),
    })
    .from(t)
    .where(eq(t.id, id))) as Array<{
    createdBy: string | null;
    businessDate: string;
    deletedAt: Date | null;
    verifiedAt?: Date | null;
  }>;
  if (!row || row.deletedAt) throw new ApiException('NOT_FOUND', 'record not found');
  // Round 2 two-tick: accountant-verified money is PERMANENT — no edit/void for ANYONE (incl. Owner).
  if (row.verifiedAt) {
    throw new ApiException('CONFLICT', 'This entry is accountant-verified and permanent — it cannot be changed');
  }
  if (ctx.role === 'OWNER') return;
  if (row.createdBy !== ctx.userId) forbidScope('Only the creator may edit/void this record (Owner override required)');
  const today = businessDateNow(new Date(), await loadEodCutoff(tx));
  if (daysBetween(row.businessDate, today) > 1) {
    forbidScope('Edit window closed (creator may edit until business-day +1; Owner override required)');
  }
}

