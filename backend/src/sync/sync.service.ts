import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@techbuilder/contracts/db/schema';
import type { SyncEvent, SyncResult } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import type { Principal } from '../common/current-user.decorator';

/** entityType (outbox) → table. Creates are idempotent via the client UUIDv7 PK + onConflictDoNothing. */
const REGISTRY: Record<string, PgTable> = {
  person: schema.people,
  site: schema.sites,
  'vehicle-type': schema.vehicleTypes,
  vehicle: schema.vehicles,
  attendance: schema.attendance,
  leave: schema.leaves,
  'wage-rate': schema.wageRates,
  advance: schema.advances,
  progress: schema.progressNotes,
  expense: schema.expenses,
  fuel: schema.fuelLogs,
  'vehicle-log': schema.vehicleLogs,
  trip: schema.trips,
  'material-txn': schema.materialTxns,
  issue: schema.issues,
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
        results.push({ outboxId: ev.outboxId, ok: false, errorCode: e instanceof Error ? e.message : 'INTERNAL' });
      }
    }
    return results;
  }

  private async applyOne(p: Principal, ev: SyncEvent): Promise<void> {
    const table = REGISTRY[ev.entityType];
    if (!table) throw new Error('UNKNOWN_ENTITY');
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = table as any;
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      if (ev.op === 'CREATE') {
        await tx
          .insert(table)
          .values({ ...payload, orgId: p.orgId, createdBy: p.userId, updatedBy: p.userId } as never)
          .onConflictDoNothing();
      } else if (ev.op === 'UPDATE') {
        await tx
          .update(table)
          .set({ ...payload, updatedBy: p.userId, updatedAt: new Date() } as never)
          .where(eq(t.id, payload.id as string));
      } else {
        await tx
          .update(table)
          .set({ deletedAt: new Date(), updatedBy: p.userId } as never)
          .where(eq(t.id, payload.id as string));
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
