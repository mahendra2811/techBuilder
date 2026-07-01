import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateProgressNoteInput,
  CreateExpenseInput,
  CreateFuelLogInput,
  CreateVehicleLogInput,
  CreateTripInput,
  CreateMaterialTxnInput,
  CreateIssueInput,
  ProgressNote,
  Expense,
  FuelLog,
  VehicleLog,
  Trip,
  MaterialTxn,
  Issue,
} from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class RecordsService {
  constructor(private readonly dbs: DbService) {}

  // ---- createProgressNote ----
  async createProgressNote(p: Principal, input: CreateProgressNoteInput): Promise<ProgressNote> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
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

  // ---- updateRecord ----
  async updateRecord(p: Principal, entityType: string, id: string, patch: Record<string, unknown>): Promise<void> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      switch (entityType) {
        case 'progress': {
          await tx
            .update(schema.progressNotes)
            .set({
              ...(patch as Partial<typeof schema.progressNotes.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.progressNotes.version} + 1`,
            })
            .where(and(eq(schema.progressNotes.id, id), isNull(schema.progressNotes.deletedAt)));
          break;
        }
        case 'expense': {
          await tx
            .update(schema.expenses)
            .set({
              ...(patch as Partial<typeof schema.expenses.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.expenses.version} + 1`,
            })
            .where(and(eq(schema.expenses.id, id), isNull(schema.expenses.deletedAt)));
          break;
        }
        case 'fuel': {
          await tx
            .update(schema.fuelLogs)
            .set({
              ...(patch as Partial<typeof schema.fuelLogs.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.fuelLogs.version} + 1`,
            })
            .where(and(eq(schema.fuelLogs.id, id), isNull(schema.fuelLogs.deletedAt)));
          break;
        }
        case 'vehicle-log': {
          await tx
            .update(schema.vehicleLogs)
            .set({
              ...(patch as Partial<typeof schema.vehicleLogs.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.vehicleLogs.version} + 1`,
            })
            .where(and(eq(schema.vehicleLogs.id, id), isNull(schema.vehicleLogs.deletedAt)));
          break;
        }
        case 'trip': {
          await tx
            .update(schema.trips)
            .set({
              ...(patch as Partial<typeof schema.trips.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.trips.version} + 1`,
            })
            .where(and(eq(schema.trips.id, id), isNull(schema.trips.deletedAt)));
          break;
        }
        case 'material-txn': {
          await tx
            .update(schema.materialTxns)
            .set({
              ...(patch as Partial<typeof schema.materialTxns.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.materialTxns.version} + 1`,
            })
            .where(and(eq(schema.materialTxns.id, id), isNull(schema.materialTxns.deletedAt)));
          break;
        }
        case 'issue': {
          await tx
            .update(schema.issues)
            .set({
              ...(patch as Partial<typeof schema.issues.$inferInsert>),
              updatedBy: p.userId,
              updatedAt: new Date(),
              version: sql`${schema.issues.version} + 1`,
            })
            .where(and(eq(schema.issues.id, id), isNull(schema.issues.deletedAt)));
          break;
        }
        default:
          throw new ApiException('NOT_FOUND', `Unknown entity type: ${entityType}`);
      }
    });
  }

  // ---- voidRecord ----
  async voidRecord(p: Principal, entityType: string, id: string): Promise<void> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      switch (entityType) {
        case 'progress': {
          await tx
            .update(schema.progressNotes)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.progressNotes.version} + 1` })
            .where(eq(schema.progressNotes.id, id));
          break;
        }
        case 'expense': {
          await tx
            .update(schema.expenses)
            .set({ deletedAt: new Date(), void: true, updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.expenses.version} + 1` })
            .where(eq(schema.expenses.id, id));
          break;
        }
        case 'fuel': {
          await tx
            .update(schema.fuelLogs)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.fuelLogs.version} + 1` })
            .where(eq(schema.fuelLogs.id, id));
          break;
        }
        case 'vehicle-log': {
          await tx
            .update(schema.vehicleLogs)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.vehicleLogs.version} + 1` })
            .where(eq(schema.vehicleLogs.id, id));
          break;
        }
        case 'trip': {
          await tx
            .update(schema.trips)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.trips.version} + 1` })
            .where(eq(schema.trips.id, id));
          break;
        }
        case 'material-txn': {
          await tx
            .update(schema.materialTxns)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.materialTxns.version} + 1` })
            .where(eq(schema.materialTxns.id, id));
          break;
        }
        case 'issue': {
          await tx
            .update(schema.issues)
            .set({ deletedAt: new Date(), updatedBy: p.userId, updatedAt: new Date(), version: sql`${schema.issues.version} + 1` })
            .where(eq(schema.issues.id, id));
          break;
        }
        default:
          throw new ApiException('NOT_FOUND', `Unknown entity type: ${entityType}`);
      }
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
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      switch (entityType) {
        case 'progress': {
          const rows = await tx
            .select()
            .from(schema.progressNotes)
            .where(
              and(
                isNull(schema.progressNotes.deletedAt),
                siteId ? eq(schema.progressNotes.siteId, siteId) : undefined,
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
                gte(schema.materialTxns.businessDate, from),
                lte(schema.materialTxns.businessDate, to),
              ),
            )
            .orderBy(desc(schema.materialTxns.createdAt));
          return rows.map(mapMaterialTxn);
        }
        case 'issue': {
          const rows = await tx
            .select()
            .from(schema.issues)
            .where(
              and(
                isNull(schema.issues.deletedAt),
                siteId ? eq(schema.issues.siteId, siteId) : undefined,
                gte(schema.issues.businessDate, from),
                lte(schema.issues.businessDate, to),
              ),
            )
            .orderBy(desc(schema.issues.createdAt));
          return rows.map(mapIssue);
        }
        default:
          throw new ApiException('NOT_FOUND', `Unknown entity type: ${entityType}`);
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
