/**
 * expo-sqlite implementation of the engine's OutboxStore. Drop-in replacement for InMemoryOutboxStore —
 * same interface, so the Outbox engine (idempotency/backoff/cap) is unchanged. Survives app restarts.
 */
import * as SQLite from 'expo-sqlite';
import type { OutboxRecord, OutboxStore } from './outbox';
import type { OutboxOp, OutboxStatus } from '@techbuilder/contracts';

const DDL = `CREATE TABLE IF NOT EXISTS outbox (
  outbox_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL, entity_type TEXT NOT NULL,
  op TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL, last_error TEXT
);`;

interface Row {
  outbox_id: string; idempotency_key: string; entity_type: string; op: string;
  payload: string; status: string; attempts: number; next_attempt_at: number; last_error: string | null;
}
const toRec = (r: Row): OutboxRecord => ({
  outboxId: r.outbox_id, idempotencyKey: r.idempotency_key, entityType: r.entity_type,
  op: r.op as OutboxOp, payload: JSON.parse(r.payload), status: r.status as OutboxStatus,
  attempts: r.attempts, nextAttemptAt: r.next_attempt_at, lastError: r.last_error ?? undefined,
});

export class SqliteOutboxStore implements OutboxStore {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(name = 'techbuilder.db'): Promise<SqliteOutboxStore> {
    const db = await SQLite.openDatabaseAsync(name);
    await db.execAsync('PRAGMA journal_mode = WAL;'); // perf + concurrency (see conventions)
    await db.execAsync(DDL);
    return new SqliteOutboxStore(db);
  }

  async add(r: OutboxRecord): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO outbox (outbox_id, idempotency_key, entity_type, op, payload, status, attempts, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.outboxId, r.idempotencyKey, r.entityType, r.op, JSON.stringify(r.payload), r.status, r.attempts, r.nextAttemptAt, r.lastError ?? null],
    );
  }

  async duePending(now: number): Promise<OutboxRecord[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM outbox WHERE status = 'PENDING' AND next_attempt_at <= ? ORDER BY outbox_id`,
      [now],
    );
    return rows.map(toRec);
  }

  async update(outboxId: string, patch: Partial<OutboxRecord>): Promise<void> {
    const cur = await this.db.getFirstAsync<Row>(`SELECT * FROM outbox WHERE outbox_id = ?`, [outboxId]);
    if (!cur) return;
    const next = { ...toRec(cur), ...patch };
    await this.add(next);
  }

  async counts(): Promise<{ pending: number; failed: number; synced: number }> {
    const row = await this.db.getFirstAsync<{ pending: number; failed: number; synced: number }>(
      `SELECT
         SUM(CASE WHEN status IN ('PENDING','IN_FLIGHT') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END) AS synced
       FROM outbox`,
    );
    return { pending: row?.pending ?? 0, failed: row?.failed ?? 0, synced: row?.synced ?? 0 };
  }
}
