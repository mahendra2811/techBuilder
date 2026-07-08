import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@techbuilder/contracts/db/schema';
import { can, type Action } from '@techbuilder/contracts';
import { loadExpenseLimits } from '../common/org-config.util';
import type {
  CreateProgressNoteInput,
  CreateExpenseInput,
  CreateFuelLogInput,
  CreateVehicleLogInput,
  CreateTripInput,
  CreateMaterialTxnInput,
  CreateIssueInput,
  ResolveIssueInput,
  CloseIssueInput,
  ProgressNote,
  Expense,
  FuelLog,
  VehicleLog,
  Trip,
  MaterialTxn,
  Issue,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import {
  assertSiteInScope,
  assertVehicleInScope,
  forbidScope,
  inSet,
  loadScope,
  vehicleReadFilter,
  type ScopeContext,
} from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';
import { RECORD_CREATE_BACKDATE_LIMIT_DAYS, assertBackdateWindow } from '../common/backdate.util';

type RecordEntityType = 'progress' | 'expense' | 'fuel' | 'vehicle-log' | 'trip' | 'material-txn' | 'issue';

const TABLES: Record<RecordEntityType, PgTable> = {
  progress: schema.progressNotes,
  expense: schema.expenses,
  fuel: schema.fuelLogs,
  'vehicle-log': schema.vehicleLogs,
  trip: schema.trips,
  'material-txn': schema.materialTxns,
  issue: schema.issues,
};

/** Which RBAC action governs each record family (drivers hold vehicleLog.enter, not record.enter). */
const ACTION_FOR: Record<RecordEntityType, Action> = {
  progress: 'record.enter',
  expense: 'record.enter',
  'material-txn': 'record.enter',
  issue: 'record.enter',
  fuel: 'vehicleLog.enter',
  'vehicle-log': 'vehicleLog.enter',
  trip: 'vehicleLog.enter',
};

function entityTypeOf(raw: string): RecordEntityType {
  if (raw in TABLES) return raw as RecordEntityType;
  throw new ApiException('NOT_FOUND', `Unknown entity type: ${raw}`);
}

/** Fields a PATCH may never rewrite (attribution, identity, window-evasion). */
const IMMUTABLE_PATCH_FIELDS = new Set([
  'id',
  'orgId',
  'org_id',
  'createdBy',
  'created_by',
  'createdAt',
  'created_at',
  'enteredBy',
  'entered_by',
  'markedBy',
  'marked_by',
  'version',
  'deletedAt',
  'deleted_at',
  'businessDate', // date moves would reopen/evade the edit window — void + re-create instead
  'business_date',
]);

function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (!IMMUTABLE_PATCH_FIELDS.has(k)) out[k] = v;
  return out;
}

@Injectable()
export class RecordsService {
  constructor(private readonly dbs: DbService) {}

  // ---- createProgressNote ----
  async createProgressNote(p: Principal, input: CreateProgressNoteInput): Promise<ProgressNote> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertSiteInScope(ctx, 'record.enter', input.siteId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      const [row] = await tx
        .insert(schema.progressNotes)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId: input.siteId,
          text: input.text,
          businessDate: input.businessDate,
          enteredBy: p.userId,
          mediaIds: input.mediaIds ?? [],
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.progressNotes)
          .where(eq(schema.progressNotes.id, input.id));
        if (existing) return mapProgressNote(existing);
        throw new ApiException('CONFLICT', 'Could not create progress note');
      }
      return mapProgressNote(row);
    });
  }

  // ---- createExpense ----
  async createExpense(p: Principal, input: CreateExpenseInput): Promise<Expense> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertSiteInScope(ctx, 'record.enter', input.siteId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      // Client-plan v1 per-entry direct limits: TH ≤ ₹25k, SM ≤ ₹1L (site-overridable, edited one
      // level above). Over the line → the client converts the entry into an EXPENSE_ADD request.
      if (ctx.role === 'TEAM_HEAD' || ctx.role === 'SITE_MANAGER') {
        const limits = await loadExpenseLimits(tx, input.siteId);
        const directLimit = ctx.role === 'TEAM_HEAD' ? limits.thDirectLimitPaise : limits.smDirectLimitPaise;
        if (input.amountPaise > directLimit) {
          throw new ApiException(
            'VALIDATION_FAILED',
            'Amount exceeds your direct-entry limit — submit it as a request for approval',
            { amountPaise: 'OVER_DIRECT_LIMIT' },
          );
        }
      }
      const [row] = await tx
        .insert(schema.expenses)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId: input.siteId,
          category: input.category,
          amountPaise: input.amountPaise,
          vendorId: input.vendorId ?? null,
          billNo: input.billNo ?? null,
          receiptMediaId: input.receiptMediaId ?? null,
          paidVia: input.paidVia ?? 'CASH',
          remark: input.remark ?? null,
          businessDate: input.businessDate,
          enteredBy: p.userId,
          void: false,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.expenses)
          .where(eq(schema.expenses.id, input.id));
        if (existing) return mapExpense(existing);
        throw new ApiException('CONFLICT', 'Could not create expense');
      }
      return mapExpense(row);
    });
  }

  // ---- createFuelLog ----
  async createFuelLog(p: Principal, input: CreateFuelLogInput): Promise<FuelLog> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await assertVehicleInScope(tx, ctx, 'vehicleLog.enter', input.vehicleId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      const [row] = await tx
        .insert(schema.fuelLogs)
        .values({
          id: input.id,
          orgId: p.orgId,
          vehicleId: input.vehicleId,
          amountPaise: input.amountPaise,
          litres: input.litres,
          reading: input.reading,
          receiptMediaId: input.receiptMediaId ?? null,
          businessDate: input.businessDate,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.fuelLogs)
          .where(eq(schema.fuelLogs.id, input.id));
        if (existing) return mapFuelLog(existing);
        throw new ApiException('CONFLICT', 'Could not create fuel log');
      }
      return mapFuelLog(row);
    });
  }

  // ---- createVehicleLog ----
  async createVehicleLog(p: Principal, input: CreateVehicleLogInput): Promise<VehicleLog> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await assertVehicleInScope(tx, ctx, 'vehicleLog.enter', input.vehicleId);
      // A driver logs for themselves — the attributed driver must be their own person.
      if (ctx.role === 'DRIVER' && input.driverPersonId !== ctx.personId) {
        forbidScope('Drivers may only log for their own person');
      }
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      if (input.endReading != null && input.endReading < input.startReading) {
        throw new ApiException('VALIDATION_FAILED', 'end reading must be >= start', {
          endReading: 'end reading must be >= start reading',
        });
      }
      const [row] = await tx
        .insert(schema.vehicleLogs)
        .values({
          id: input.id,
          orgId: p.orgId,
          vehicleId: input.vehicleId,
          driverPersonId: input.driverPersonId,
          startReading: input.startReading,
          endReading: input.endReading ?? null,
          hoursWorked: input.hoursWorked ?? null,
          loadsCount: input.loadsCount ?? null,
          note: input.note ?? null,
          businessDate: input.businessDate,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoUpdate({
          target: [schema.vehicleLogs.orgId, schema.vehicleLogs.vehicleId, schema.vehicleLogs.businessDate],
          set: {
            driverPersonId: input.driverPersonId,
            startReading: input.startReading,
            endReading: input.endReading ?? null,
            hoursWorked: input.hoursWorked ?? null,
            loadsCount: input.loadsCount ?? null,
            note: input.note ?? null,
            updatedBy: p.userId,
            updatedAt: new Date(),
            version: sql`${schema.vehicleLogs.version} + 1`,
          },
        })
        .returning();
      if (!row) {
        throw new ApiException('CONFLICT', 'Could not create vehicle log');
      }
      return mapVehicleLog(row);
    });
  }

  // ---- createTrip ----
  async createTrip(p: Principal, input: CreateTripInput): Promise<Trip> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await assertVehicleInScope(tx, ctx, 'vehicleLog.enter', input.vehicleId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      const [row] = await tx
        .insert(schema.trips)
        .values({
          id: input.id,
          orgId: p.orgId,
          vehicleId: input.vehicleId,
          fromText: input.fromText,
          toText: input.toText,
          purpose: input.purpose ?? null,
          materialTxnId: input.materialTxnId ?? null,
          businessDate: input.businessDate,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.trips)
          .where(eq(schema.trips.id, input.id));
        if (existing) return mapTrip(existing);
        throw new ApiException('CONFLICT', 'Could not create trip');
      }
      return mapTrip(row);
    });
  }

  // ---- createMaterialTxn ----
  async createMaterialTxn(p: Principal, input: CreateMaterialTxnInput): Promise<MaterialTxn> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertSiteInScope(ctx, 'record.enter', input.siteId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      const [row] = await tx
        .insert(schema.materialTxns)
        .values({
          id: input.id,
          orgId: p.orgId,
          type: input.type,
          materialId: input.materialId,
          qty: input.qty,
          uom: input.uom,
          siteId: input.siteId,
          counterpartSiteId: input.counterpartSiteId ?? null,
          relatedTxnId: input.relatedTxnId ?? null,
          status: 'CONFIRMED',
          businessDate: input.businessDate,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.materialTxns)
          .where(eq(schema.materialTxns.id, input.id));
        if (existing) return mapMaterialTxn(existing);
        throw new ApiException('CONFLICT', 'Could not create material transaction');
      }
      return mapMaterialTxn(row);
    });
  }

  // ---- createIssue ----
  async createIssue(p: Principal, input: CreateIssueInput): Promise<Issue> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (input.siteId) assertSiteInScope(ctx, 'record.enter', input.siteId);
      else if (input.vehicleId) await assertVehicleInScope(tx, ctx, 'record.enter', input.vehicleId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, RECORD_CREATE_BACKDATE_LIMIT_DAYS);
      const [row] = await tx
        .insert(schema.issues)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId: input.siteId ?? null,
          vehicleId: input.vehicleId ?? null,
          severity: input.severity,
          description: input.description,
          status: 'OPEN',
          businessDate: input.businessDate,
          mediaIds: input.mediaIds ?? [],
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.issues)
          .where(eq(schema.issues.id, input.id));
        if (existing) return mapIssue(existing);
        throw new ApiException('CONFLICT', 'Could not create issue');
      }
      return mapIssue(row);
    });
  }

  /**
   * WO-11/WO-12 damage lifecycle step 1 — SM (own site, or the site of the issue's vehicle) /
   * OWNER (any) marks an OPEN issue RESOLVED with a note on what was repaired. Mirrors
   * ApprovalsService.assertDecideScope's vehicle-site fallback (issues, like vehicle-switch
   * requests, may be vehicle-stamped rather than site-stamped). NOT gated by `record.enter` —
   * the OWNER has no `record.enter` scope in the RBAC matrix, so a fixed decorator would wrongly
   * lock the Owner out (same reasoning as updateRecord/voidRecord below).
   */
  async resolveIssue(p: Principal, id: string, input: ResolveIssueInput): Promise<Issue> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [row] = await tx.select().from(schema.issues).where(and(eq(schema.issues.id, id), isNull(schema.issues.deletedAt)));
      if (!row) throw new ApiException('NOT_FOUND', 'Issue not found');
      if (row.status !== 'OPEN') throw new ApiException('CONFLICT', 'Issue is not open');

      if (ctx.role !== 'OWNER') {
        if (ctx.role !== 'SITE_MANAGER') forbidScope('Only a Site Manager or Owner may resolve a damage report');
        let inScope = !!row.siteId && ctx.siteIds.includes(row.siteId);
        if (!inScope && row.vehicleId) {
          const [v] = await tx
            .select({ siteId: schema.vehicles.assignedSiteId })
            .from(schema.vehicles)
            .where(and(eq(schema.vehicles.id, row.vehicleId), isNull(schema.vehicles.deletedAt)));
          inScope = !!v?.siteId && ctx.siteIds.includes(v.siteId);
        }
        if (!inScope) forbidScope('Issue is outside your site scope');
      }

      const [updated] = await tx
        .update(schema.issues)
        .set({
          status: 'RESOLVED',
          resolvedBy: p.userId,
          resolutionNote: input.resolutionNote,
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.issues.version} + 1`,
        })
        .where(eq(schema.issues.id, id))
        .returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Issue not found');
      return mapIssue(updated);
    });
  }

  /**
   * WO-11/WO-12 damage lifecycle step 2 — the issue's CREATOR (the one who raised it, usually
   * the driver) may add an optional closing remark once it is RESOLVED. There is no separate
   * CLOSED status in the frozen `ISSUE_STATUSES` enum — closing is just the creator's
   * acknowledgement note; status stays RESOLVED. Not gated by `record.enter` for the same
   * reason as resolveIssue (a driver holds `vehicleLog.enter`, not `record.enter`).
   */
  async closeIssue(p: Principal, id: string, input: CloseIssueInput): Promise<Issue> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx.select().from(schema.issues).where(and(eq(schema.issues.id, id), isNull(schema.issues.deletedAt)));
      if (!row) throw new ApiException('NOT_FOUND', 'Issue not found');
      if (row.createdBy !== p.userId) forbidScope('Only the person who raised this issue may close it');
      if (row.status !== 'RESOLVED') throw new ApiException('CONFLICT', 'Issue must be resolved before it can be closed');

      const [updated] = await tx
        .update(schema.issues)
        .set({
          closingNote: input.closingNote ?? null,
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.issues.version} + 1`,
        })
        .where(eq(schema.issues.id, id))
        .returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Issue not found');
      return mapIssue(updated);
    });
  }

  /**
   * WP-3 guard (shared by update + void): action per entity family; only the CREATOR may
   * edit/void, and only until end of business-day +1 (org EOD cutoff). Owner override is
   * allowed any time (audited via updatedBy/version).
   */
  private async assertEditAllowed(tx: Tx, ctx: ScopeContext, et: RecordEntityType, id: string): Promise<void> {
    const table = TABLES[et];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = table as any;
    const [row] = (await tx
      .select({ createdBy: t.createdBy, businessDate: t.businessDate, deletedAt: t.deletedAt })
      .from(table)
      .where(eq(t.id, id))) as Array<{ createdBy: string | null; businessDate: string; deletedAt: Date | null }>;
    if (!row || row.deletedAt) throw new ApiException('NOT_FOUND', `${et} record not found`);
    if (ctx.role === 'OWNER') return; // audited override

    const action = ACTION_FOR[et];
    if (!can(ctx.role, action)) forbidScope(`Role ${ctx.role} cannot ${action}`);
    if (row.createdBy !== ctx.userId) {
      forbidScope('Only the creator may edit/void this record (Owner override required)');
    }
    const today = businessDateNow(new Date(), await loadEodCutoff(tx));
    if (daysBetween(row.businessDate, today) > 1) {
      forbidScope('Edit window closed (creator may edit until business-day +1; Owner override required)');
    }
  }

  // ---- updateRecord ----
  async updateRecord(p: Principal, entityType: string, id: string, patch: Record<string, unknown>): Promise<void> {
    const et = entityTypeOf(entityType);
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.assertEditAllowed(tx, ctx, et, id);
      const safePatch = sanitizePatch(patch);
      const table = TABLES[et];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = table as any;
      await tx
        .update(table)
        .set({
          ...safePatch,
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${t.version} + 1`,
        } as never)
        .where(and(eq(t.id, id), isNull(t.deletedAt)));
    });
  }

  // ---- voidRecord ----
  async voidRecord(p: Principal, entityType: string, id: string): Promise<void> {
    const et = entityTypeOf(entityType);
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      await this.assertEditAllowed(tx, ctx, et, id);
      const table = TABLES[et];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = table as any;
      const set: Record<string, unknown> = {
        deletedAt: new Date(),
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${t.version} + 1`,
      };
      if (et === 'expense') set['void'] = true; // financial entries carry an explicit void flag
      await tx
        .update(table)
        .set(set as never)
        .where(eq(t.id, id));
    });
  }

  // ---- listRecords ----
  async listRecords(
    p: Principal,
    entityType: string,
    siteId: string | undefined,
    from: string,
    to: string,
  ): Promise<unknown[]> {
    const et = entityTypeOf(entityType);
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);

      /** Role-scope filter for site-stamped records; `financial` narrows TH to own entries. */
      const siteScope = (siteCol: import('drizzle-orm').AnyColumn, enteredByCol: import('drizzle-orm').AnyColumn, financial: boolean): SQL | undefined => {
        switch (ctx.role) {
          case 'OWNER':
            return undefined;
          case 'SITE_MANAGER':
            return inSet(siteCol, ctx.siteIds);
          case 'TEAM_HEAD':
            return financial ? (eq(enteredByCol, ctx.userId) as SQL) : inSet(siteCol, ctx.siteIds);
          default:
            return eq(enteredByCol, ctx.userId) as SQL; // DRIVER / WORKER → own entries only
        }
      };

      switch (et) {
        case 'progress': {
          const rows = await tx
            .select()
            .from(schema.progressNotes)
            .where(
              and(
                isNull(schema.progressNotes.deletedAt),
                siteId ? eq(schema.progressNotes.siteId, siteId) : undefined,
                siteScope(schema.progressNotes.siteId, schema.progressNotes.enteredBy, false),
                gte(schema.progressNotes.businessDate, from),
                lte(schema.progressNotes.businessDate, to),
              ),
            )
            .orderBy(desc(schema.progressNotes.createdAt));
          return rows.map(mapProgressNote);
        }
        case 'expense': {
          const rows = await tx
            .select()
            .from(schema.expenses)
            .where(
              and(
                isNull(schema.expenses.deletedAt),
                siteId ? eq(schema.expenses.siteId, siteId) : undefined,
                siteScope(schema.expenses.siteId, schema.expenses.enteredBy, true),
                gte(schema.expenses.businessDate, from),
                lte(schema.expenses.businessDate, to),
              ),
            )
            .orderBy(desc(schema.expenses.createdAt));
          return rows.map(mapExpense);
        }
        case 'fuel': {
          const rows = await tx
            .select()
            .from(schema.fuelLogs)
            .where(
              and(
                isNull(schema.fuelLogs.deletedAt),
                vehicleReadFilter(tx, ctx, 'view.all', schema.fuelLogs.vehicleId),
                gte(schema.fuelLogs.businessDate, from),
                lte(schema.fuelLogs.businessDate, to),
              ),
            )
            .orderBy(desc(schema.fuelLogs.createdAt));
          return rows.map(mapFuelLog);
        }
        case 'vehicle-log': {
          const rows = await tx
            .select()
            .from(schema.vehicleLogs)
            .where(
              and(
                isNull(schema.vehicleLogs.deletedAt),
                vehicleReadFilter(tx, ctx, 'view.all', schema.vehicleLogs.vehicleId),
                gte(schema.vehicleLogs.businessDate, from),
                lte(schema.vehicleLogs.businessDate, to),
              ),
            )
            .orderBy(desc(schema.vehicleLogs.createdAt));
          return rows.map(mapVehicleLog);
        }
        case 'trip': {
          const rows = await tx
            .select()
            .from(schema.trips)
            .where(
              and(
                isNull(schema.trips.deletedAt),
                vehicleReadFilter(tx, ctx, 'view.all', schema.trips.vehicleId),
                gte(schema.trips.businessDate, from),
                lte(schema.trips.businessDate, to),
              ),
            )
            .orderBy(desc(schema.trips.createdAt));
          return rows.map(mapTrip);
        }
        case 'material-txn': {
          const rows = await tx
            .select()
            .from(schema.materialTxns)
            .where(
              and(
                isNull(schema.materialTxns.deletedAt),
                siteId ? eq(schema.materialTxns.siteId, siteId) : undefined,
                siteScope(schema.materialTxns.siteId, schema.materialTxns.createdBy, false),
                gte(schema.materialTxns.businessDate, from),
                lte(schema.materialTxns.businessDate, to),
              ),
            )
            .orderBy(desc(schema.materialTxns.createdAt));
          return rows.map(mapMaterialTxn);
        }
        case 'issue': {
          // Issues may be site-stamped OR vehicle-stamped — in-scope site OR own entries.
          const issueScope: SQL | undefined =
            ctx.role === 'OWNER'
              ? undefined
              : or(inSet(schema.issues.siteId, ctx.siteIds), eq(schema.issues.createdBy, ctx.userId));
          const rows = await tx
            .select()
            .from(schema.issues)
            .where(
              and(
                isNull(schema.issues.deletedAt),
                siteId ? eq(schema.issues.siteId, siteId) : undefined,
                issueScope,
                gte(schema.issues.businessDate, from),
                lte(schema.issues.businessDate, to),
              ),
            )
            .orderBy(desc(schema.issues.createdAt));
          return rows.map(mapIssue);
        }
      }
    });
  }
}

// ---- local mappers ----

function mapProgressNote(r: typeof schema.progressNotes.$inferSelect): ProgressNote {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    text: r.text,
    businessDate: r.businessDate,
    enteredBy: r.enteredBy,
    mediaIds: r.mediaIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapExpense(r: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    category: r.category,
    amountPaise: r.amountPaise ?? 0,
    vendorId: r.vendorId ?? null,
    billNo: r.billNo ?? null,
    paidVia: r.paidVia,
    remark: r.remark ?? null,
    receiptMediaId: r.receiptMediaId ?? null,
    businessDate: r.businessDate,
    enteredBy: r.enteredBy,
    void: r.void,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapFuelLog(r: typeof schema.fuelLogs.$inferSelect): FuelLog {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    amountPaise: r.amountPaise ?? 0,
    litres: r.litres,
    reading: r.reading,
    receiptMediaId: r.receiptMediaId ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapVehicleLog(r: typeof schema.vehicleLogs.$inferSelect): VehicleLog {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    driverPersonId: r.driverPersonId,
    startReading: r.startReading,
    endReading: r.endReading ?? null,
    hoursWorked: r.hoursWorked ?? null,
    loadsCount: r.loadsCount ?? null,
    note: r.note ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapTrip(r: typeof schema.trips.$inferSelect): Trip {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    fromText: r.fromText,
    toText: r.toText,
    purpose: r.purpose ?? null,
    materialTxnId: r.materialTxnId ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapMaterialTxn(r: typeof schema.materialTxns.$inferSelect): MaterialTxn {
  return {
    id: r.id,
    orgId: r.orgId,
    type: r.type,
    materialId: r.materialId,
    qty: r.qty,
    uom: r.uom,
    siteId: r.siteId,
    counterpartSiteId: r.counterpartSiteId ?? null,
    relatedTxnId: r.relatedTxnId ?? null,
    status: r.status,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapIssue(r: typeof schema.issues.$inferSelect): Issue {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId ?? null,
    vehicleId: r.vehicleId ?? null,
    severity: r.severity,
    description: r.description,
    status: r.status,
    resolvedBy: r.resolvedBy ?? null,
    resolutionNote: r.resolutionNote ?? null,
    closingNote: r.closingNote ?? null,
    businessDate: r.businessDate,
    mediaIds: r.mediaIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
