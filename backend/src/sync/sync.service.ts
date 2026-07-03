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
        const attribution: Record<string, unknown> = { orgId: p.orgId, createdBy: p.userId, updatedBy: p.userId };
        if (ev.entityType === 'attendance') attribution['markedBy'] = p.userId;
        if (ev.entityType === 'progress' || ev.entityType === 'expense') attribution['enteredBy'] = p.userId;
        await tx
          .insert(table)
          .values({ ...payload, ...attribution } as never)
          .onConflictDoNothing();
      } else {
        // UPDATE / VOID: same WP-3 guard as the REST path — creator-only within the window,
        // Owner override. (No attribution rewrite: updatedBy = the caller.)
        await assertEditAllowed(tx, ctx, t, payload['id'] as string);
        if (ev.op === 'UPDATE') {
          const { id: _id, orgId: _org, createdBy: _cb, enteredBy: _eb, markedBy: _mb, version: _v, businessDate: _bd, ...rest } = payload;
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
    if (ctx.role === 'TEAM_HEAD') assertPersonInScope(ctx, action, personId);
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
  if (siteId) assertSiteInScope(ctx, action, siteId);
  else if (vehicleId) await assertVehicleInScope(tx, ctx, action, vehicleId);
  else if (entityType !== 'issue') throw new ApiException('VALIDATION_FAILED', `${entityType} requires siteId`);
}

/** WP-3 (sync flavor): creator-only edit/void within business-day +1; Owner override. */
async function assertEditAllowed(
  tx: Tx,
  ctx: ScopeContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
  id: string | undefined,
): Promise<void> {
  if (!id) throw new ApiException('VALIDATION_FAILED', 'payload.id required for update/void');
  const [row] = (await tx
    .select({ createdBy: t.createdBy, businessDate: t.businessDate, deletedAt: t.deletedAt })
    .from(t)
    .where(eq(t.id, id))) as Array<{ createdBy: string | null; businessDate: string; deletedAt: Date | null }>;
  if (!row || row.deletedAt) throw new ApiException('NOT_FOUND', 'record not found');
  if (ctx.role === 'OWNER') return;
  if (row.createdBy !== ctx.userId) forbidScope('Only the creator may edit/void this record (Owner override required)');
  const today = businessDateNow(new Date(), await loadEodCutoff(tx));
  if (daysBetween(row.businessDate, today) > 1) {
    forbidScope('Edit window closed (creator may edit until business-day +1; Owner override required)');
  }
}

