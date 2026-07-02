/**
 * WP-6 — honest offline posture. EXACTLY three loss-critical writes queue offline
 * (attendance, expense, fuel — the records a field user cannot re-create from memory at
 * night); every other write is online-required and surfaces a clear "offline" signal.
 *
 * Screens keep calling RecordsClient unchanged — this wraps the rest adapter only.
 * Server-side, /sync/push re-checks action + scope + backdating for each queued event.
 */
import type { RecordsClient, Attendance, Expense, FuelLog } from '@techbuilder/contracts';
import type * as Dto from '@techbuilder/contracts';
import type { Outbox } from './outbox';

export interface OfflineOptions {
  /** Current user id — used to stamp optimistic local results (server re-stamps on sync). */
  getUserId: () => string | null;
  /** Called when a NON-critical write is attempted offline (show a toast/alert). */
  onOfflineRejected?: (method: string) => void;
  /** Called when a critical write was queued instead of sent (optional "saved offline" hint). */
  onQueued?: (entityType: string) => void;
}

/** Network-level failure = no `.code` (the RestClient attaches `.code` to server rejections). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof Error && !(e as { code?: string }).code;
}

/** Error thrown for non-critical writes attempted offline. */
export class OfflineWriteError extends Error {
  readonly code = 'OFFLINE';
  constructor(method: string) {
    super(`Offline — ${method} requires a connection (will not be queued)`);
  }
}

const nowIso = (): string => new Date().toISOString();

function auditStamp(by: string): Pick<Attendance, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt' | 'version'> {
  return { createdAt: nowIso(), updatedAt: nowIso(), createdBy: by, updatedBy: by, deletedAt: null, version: 1 };
}

/** Non-critical write methods that must be online (reads are untouched — they just fail/refetch). */
const ONLINE_ONLY_WRITES: ReadonlyArray<keyof RecordsClient> = [
  'createSite',
  'createUser',
  'deactivateUser',
  'createPerson',
  'createVehicleType',
  'createVehicle',
  'createLeave',
  'createProgressNote',
  'createVehicleLog',
  'createTrip',
  'createMaterialTxn',
  'createIssue',
  'updateRecord',
  'voidRecord',
  'submitRequest',
  'decideRequest',
  'setWageRate',
  'createAdvance',
];

export function withOfflineOutbox(records: RecordsClient, outbox: Outbox, opts: OfflineOptions): RecordsClient {
  const me = (): string => opts.getUserId() ?? 'local';

  const wrapped: RecordsClient = {
    ...records,

    // ---- critical write 1: attendance (queued per-row; server upserts idempotently) ----
    async markAttendance(input: Dto.MarkAttendanceInput): Promise<Attendance[]> {
      try {
        return await records.markAttendance(input);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        for (const row of input.rows) {
          await outbox.enqueue('attendance', 'CREATE', {
            id: row.id,
            siteId: input.siteId,
            crewId: input.crewId ?? null,
            personId: row.personId,
            businessDate: input.businessDate,
            status: row.status,
            otHours: row.otHours ?? 0,
          });
        }
        opts.onQueued?.('attendance');
        return input.rows.map((row) => ({
          id: row.id,
          orgId: '',
          siteId: input.siteId,
          crewId: input.crewId ?? null,
          personId: row.personId,
          businessDate: input.businessDate,
          status: row.status,
          otHours: row.otHours ?? 0,
          markedBy: me(),
          ...auditStamp(me()),
        }));
      }
    },

    // ---- critical write 2: expense ----
    async createExpense(input: Dto.CreateExpenseInput): Promise<Expense> {
      try {
        return await records.createExpense(input);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await outbox.enqueue('expense', 'CREATE', {
          id: input.id,
          siteId: input.siteId,
          category: input.category,
          amountPaise: input.amountPaise,
          vendorId: input.vendorId ?? null,
          billNo: input.billNo ?? null,
          receiptMediaId: input.receiptMediaId ?? null,
          businessDate: input.businessDate,
          void: false,
        });
        opts.onQueued?.('expense');
        return {
          id: input.id,
          orgId: '',
          siteId: input.siteId,
          category: input.category,
          amountPaise: input.amountPaise,
          vendorId: input.vendorId ?? null,
          billNo: input.billNo ?? null,
          receiptMediaId: input.receiptMediaId ?? null,
          businessDate: input.businessDate,
          enteredBy: me(),
          void: false,
          ...auditStamp(me()),
        };
      }
    },

    // ---- critical write 3: fuel ----
    async createFuelLog(input: Dto.CreateFuelLogInput): Promise<FuelLog> {
      try {
        return await records.createFuelLog(input);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await outbox.enqueue('fuel', 'CREATE', {
          id: input.id,
          vehicleId: input.vehicleId,
          amountPaise: input.amountPaise,
          litres: input.litres,
          reading: input.reading,
          receiptMediaId: input.receiptMediaId ?? null,
          businessDate: input.businessDate,
        });
        opts.onQueued?.('fuel');
        return {
          id: input.id,
          orgId: '',
          vehicleId: input.vehicleId,
          amountPaise: input.amountPaise,
          litres: input.litres,
          reading: input.reading,
          receiptMediaId: input.receiptMediaId ?? null,
          businessDate: input.businessDate,
          ...auditStamp(me()),
        };
      }
    },
  };

  // Non-critical writes: pass through, but convert network failures into a clear OFFLINE error.
  for (const method of ONLINE_ONLY_WRITES) {
    const original = records[method];
    if (typeof original !== 'function') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapped as any)[method] = async (...args: unknown[]) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (original as any).apply(records, args);
      } catch (e) {
        if (isNetworkError(e)) {
          opts.onOfflineRejected?.(String(method));
          throw new OfflineWriteError(String(method));
        }
        throw e;
      }
    };
  }

  return wrapped;
}
