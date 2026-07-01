/**
 * Offline outbox — local-first writes queue. Writes go local → enqueued → flushed to the backend via SyncClient
 * when online. Idempotent (idempotencyKey), exponential backoff, attempt cap. LWW resolution is server-side.
 * Storage is abstracted: InMemoryOutboxStore now; an expo-sqlite store replaces it in the RN shell (same interface).
 */
import { uuidv7 } from 'uuidv7';
import type { SyncClient, SyncEvent, OutboxStatus, OutboxOp } from '@techbuilder/contracts';

export interface OutboxRecord {
  outboxId: string;
  idempotencyKey: string;
  entityType: string;
  op: OutboxOp;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  lastError?: string;
}

export interface OutboxStore {
  add(rec: OutboxRecord): Promise<void>;
  duePending(now: number): Promise<OutboxRecord[]>;
  update(outboxId: string, patch: Partial<OutboxRecord>): Promise<void>;
  counts(): Promise<{ pending: number; failed: number; synced: number }>;
}

export class InMemoryOutboxStore implements OutboxStore {
  private rows = new Map<string, OutboxRecord>();
  async add(rec: OutboxRecord): Promise<void> {
    this.rows.set(rec.outboxId, rec);
  }
  async duePending(now: number): Promise<OutboxRecord[]> {
    return [...this.rows.values()].filter((r) => r.status === 'PENDING' && r.nextAttemptAt <= now);
  }
  async update(outboxId: string, patch: Partial<OutboxRecord>): Promise<void> {
    const r = this.rows.get(outboxId);
    if (r) this.rows.set(outboxId, { ...r, ...patch });
  }
  async counts(): Promise<{ pending: number; failed: number; synced: number }> {
    const all = [...this.rows.values()];
    return {
      pending: all.filter((r) => r.status === 'PENDING' || r.status === 'IN_FLIGHT').length,
      failed: all.filter((r) => r.status === 'FAILED').length,
      synced: all.filter((r) => r.status === 'SYNCED').length,
    };
  }
}

const MAX_ATTEMPTS = 8;
const backoffMs = (attempts: number): number => Math.min(5_000 * 2 ** attempts, 5 * 60_000);

export class Outbox {
  constructor(
    private readonly store: OutboxStore,
    private readonly sync: SyncClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Queue a write. Returns the outboxId. The local DB write happens separately (optimistic UI). */
  async enqueue(entityType: string, op: OutboxOp, payload: unknown): Promise<string> {
    const rec: OutboxRecord = {
      outboxId: uuidv7(),
      idempotencyKey: uuidv7(),
      entityType,
      op,
      payload,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: 0,
    };
    await this.store.add(rec);
    return rec.outboxId;
  }

  /** Push all due-pending events. Idempotent; failures get backoff; poison events park as FAILED after the cap. */
  async flush(): Promise<{ ok: number; failed: number }> {
    const due = await this.store.duePending(this.now());
    if (due.length === 0) return { ok: 0, failed: 0 };

    const events: SyncEvent[] = due.map((r) => ({
      outboxId: r.outboxId,
      idempotencyKey: r.idempotencyKey,
      entityType: r.entityType,
      op: r.op,
      payload: r.payload,
    }));
    for (const r of due) await this.store.update(r.outboxId, { status: 'IN_FLIGHT' });

    let ok = 0;
    let failed = 0;
    try {
      const results = await this.sync.pushBatch(events);
      const byId = new Map(results.map((res) => [res.outboxId, res]));
      for (const r of due) {
        const res = byId.get(r.outboxId);
        if (res?.ok) {
          await this.store.update(r.outboxId, { status: 'SYNCED' });
          ok += 1;
        } else {
          await this.parkOrRetry(r, res?.errorCode ?? 'PUSH_FAILED');
          failed += 1;
        }
      }
    } catch (e) {
      // network error — retry the whole batch with backoff
      for (const r of due) await this.parkOrRetry(r, e instanceof Error ? e.message : 'NETWORK');
      failed = due.length;
    }
    return { ok, failed };
  }

  private async parkOrRetry(r: OutboxRecord, lastError: string): Promise<void> {
    const attempts = r.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.store.update(r.outboxId, { status: 'FAILED', attempts, lastError });
    } else {
      await this.store.update(r.outboxId, { status: 'PENDING', attempts, lastError, nextAttemptAt: this.now() + backoffMs(attempts) });
    }
  }
}
