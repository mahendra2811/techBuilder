/**
 * Round 2 (C7) — diesel stock + the two-sided double-check.
 *
 * The SUPERVISOR buys bulk diesel for the site (stock = purchases − issuances) and issues it
 * per vehicle; the vehicle's DRIVER logs the received side (fuel_logs — hook lives in
 * records.service). Matching is exact-litres on (vehicle, business date); the red-flag read
 * serves the ACCOUNTANT (own sites) / SM (own sites) / OWNER. Pure verdict/flag logic in
 * fuel-match.ts (unit-tested).
 */
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateFuelIssuanceInput,
  CreateFuelStockPurchaseInput,
  FuelIssuance,
  FuelMatchFlag,
  FuelStockPurchase,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { assertBackdateWindow } from '../common/backdate.util';
import { businessDateNow, addDays } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';
import { deriveDayFlags, matchVerdict, type DaySide } from './fuel-match';

@Injectable()
export class FuelStockService {
  constructor(private readonly dbs: DbService) {}

  /** Supervisor (own site) / SM / Owner records a bulk diesel purchase into site stock. */
  async createPurchase(p: Principal, input: CreateFuelStockPurchaseInput): Promise<FuelStockPurchase> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertStockWriter(ctx, input.siteId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, {});
      if (!(input.litres > 0)) {
        throw new ApiException('VALIDATION_FAILED', 'Litres must be positive', { litres: 'positive' });
      }
      const [row] = await tx
        .insert(schema.fuelStockPurchases)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId: input.siteId,
          litres: input.litres,
          amountPaise: input.amountPaise ?? null,
          receiptMediaId: input.receiptMediaId ?? null,
          purchasedBy: p.userId,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.fuelStockPurchases)
          .where(eq(schema.fuelStockPurchases.id, input.id));
        if (existing) return mapPurchase(existing);
        throw new ApiException('CONFLICT', 'Could not record the purchase');
      }
      return mapPurchase(row);
    });
  }

  async listPurchases(p: Principal, siteId?: string): Promise<FuelStockPurchase[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const scope = ctx.role === 'OWNER' ? undefined : inSet(schema.fuelStockPurchases.siteId, ctx.siteIds);
      const rows = await tx
        .select()
        .from(schema.fuelStockPurchases)
        .where(
          and(
            isNull(schema.fuelStockPurchases.deletedAt),
            scope,
            siteId ? eq(schema.fuelStockPurchases.siteId, siteId) : undefined,
          ),
        )
        .orderBy(desc(schema.fuelStockPurchases.businessDate));
      return rows.map(mapPurchase);
    });
  }

  /**
   * Supervisor issues diesel to a vehicle — his side of the double-check. Attempts the match
   * against an unpaired driver receipt of the same (vehicle, business date) in the same tx.
   */
  async createIssuance(p: Principal, input: CreateFuelIssuanceInput): Promise<FuelIssuance> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [vehicle] = await tx
        .select({ id: schema.vehicles.id, siteId: schema.vehicles.assignedSiteId })
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.id, input.vehicleId), isNull(schema.vehicles.deletedAt)));
      if (!vehicle) throw new ApiException('NOT_FOUND', 'Vehicle not found');
      const siteId = input.siteId ?? vehicle.siteId;
      if (!siteId) throw new ApiException('VALIDATION_FAILED', 'Vehicle has no site — pass siteId', { siteId: 'required' });
      assertStockWriter(ctx, siteId);
      await assertBackdateWindow(tx, ctx.role, input.businessDate, {});
      if (!(input.litres > 0)) {
        throw new ApiException('VALIDATION_FAILED', 'Litres must be positive', { litres: 'positive' });
      }

      // Find the driver's unpaired receipt for the same vehicle + day (oldest first).
      const [receipt] = await tx
        .select()
        .from(schema.fuelLogs)
        .where(
          and(
            isNull(schema.fuelLogs.deletedAt),
            eq(schema.fuelLogs.vehicleId, input.vehicleId),
            eq(schema.fuelLogs.businessDate, input.businessDate),
            isNull(schema.fuelLogs.matchedIssuanceId),
          ),
        )
        .orderBy(asc(schema.fuelLogs.createdAt));

      const status = receipt ? matchVerdict(input.litres, receipt.litres) : 'PENDING';
      const [row] = await tx
        .insert(schema.fuelIssuances)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId,
          vehicleId: input.vehicleId,
          litres: input.litres,
          issuedBy: p.userId,
          businessDate: input.businessDate,
          status,
          matchedFuelLogId: receipt?.id ?? null,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.fuelIssuances).where(eq(schema.fuelIssuances.id, input.id));
        if (existing) return mapIssuance(existing);
        throw new ApiException('CONFLICT', 'Could not record the issuance');
      }
      if (receipt) {
        await tx
          .update(schema.fuelLogs)
          .set({ status, matchedIssuanceId: row.id, updatedBy: p.userId, updatedAt: new Date() })
          .where(eq(schema.fuelLogs.id, receipt.id));
      }
      return mapIssuance(row);
    });
  }

  async listIssuances(p: Principal, siteId?: string, vehicleId?: string): Promise<FuelIssuance[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const scope = ctx.role === 'OWNER' ? undefined : inSet(schema.fuelIssuances.siteId, ctx.siteIds);
      const rows = await tx
        .select()
        .from(schema.fuelIssuances)
        .where(
          and(
            isNull(schema.fuelIssuances.deletedAt),
            scope,
            siteId ? eq(schema.fuelIssuances.siteId, siteId) : undefined,
            vehicleId ? eq(schema.fuelIssuances.vehicleId, vehicleId) : undefined,
          ),
        )
        .orderBy(desc(schema.fuelIssuances.businessDate));
      return rows.map(mapIssuance);
    });
  }

  /**
   * 🚩 The diesel red-flag list: MISMATCH pairs + lone sides of CLOSED business days, inside
   * a date window (default: last 14 days). ACCOUNTANT/SM see their sites; OWNER everything.
   */
  async matchFlags(p: Principal, from?: string, to?: string): Promise<FuelMatchFlag[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
        forbidScope('Only the accountant, the SM or the Owner see diesel flags');
      }
      const today = businessDateNow(new Date(), await loadEodCutoff(tx));
      const windowFrom = from ?? addDays(today, -14);
      const windowTo = to ?? today;

      const issuances = await tx
        .select()
        .from(schema.fuelIssuances)
        .where(
          and(
            isNull(schema.fuelIssuances.deletedAt),
            gte(schema.fuelIssuances.businessDate, windowFrom),
            lte(schema.fuelIssuances.businessDate, windowTo),
            ctx.role === 'OWNER' ? undefined : inSet(schema.fuelIssuances.siteId, ctx.siteIds),
          ),
        );
      const receipts = await tx
        .select()
        .from(schema.fuelLogs)
        .where(
          and(
            isNull(schema.fuelLogs.deletedAt),
            gte(schema.fuelLogs.businessDate, windowFrom),
            lte(schema.fuelLogs.businessDate, windowTo),
          ),
        );

      // vehicle → current site (receipts carry no siteId of their own).
      const vehicleIds = [...new Set([...issuances.map((i) => i.vehicleId), ...receipts.map((r) => r.vehicleId)])];
      const vehicles = vehicleIds.length
        ? await tx
            .select({ id: schema.vehicles.id, siteId: schema.vehicles.assignedSiteId })
            .from(schema.vehicles)
            .where(inSet(schema.vehicles.id, vehicleIds))
        : [];
      const vehicleSite = new Map(vehicles.map((v) => [v.id, v.siteId]));

      // Bucket by (vehicle, businessDate) and derive flags with the pure helper.
      const buckets = new Map<string, { iss: DaySide[]; rec: DaySide[]; vehicleId: string; date: string }>();
      const bucketOf = (vehicleId: string, date: string) => {
        const key = `${vehicleId}|${date}`;
        let b = buckets.get(key);
        if (!b) {
          b = { iss: [], rec: [], vehicleId, date };
          buckets.set(key, b);
        }
        return b;
      };
      for (const i of issuances) {
        bucketOf(i.vehicleId, i.businessDate).iss.push({ id: i.id, litres: i.litres, status: i.status, matchedId: i.matchedFuelLogId ?? null });
      }
      for (const r of receipts) {
        bucketOf(r.vehicleId, r.businessDate).rec.push({ id: r.id, litres: r.litres, status: r.status, matchedId: r.matchedIssuanceId ?? null });
      }

      const out: FuelMatchFlag[] = [];
      for (const b of buckets.values()) {
        const siteId = vehicleSite.get(b.vehicleId) ?? null;
        // Scope: non-owners only see their sites' vehicles (lone receipts included via vehicle site).
        if (ctx.role !== 'OWNER' && (!siteId || !ctx.siteIds.includes(siteId))) continue;
        const dayClosed = b.date < today;
        out.push(...deriveDayFlags(b.vehicleId, siteId ?? '', b.date, b.iss, b.rec, dayClosed));
      }
      out.sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1));
      return out;
    });
  }
}

/** Who may write stock/issuances: the SUPERVISOR (site inside his crew reach), SM (own site), OWNER. */
function assertStockWriter(ctx: ScopeContext, siteId: string): void {
  if (ctx.role === 'OWNER') return;
  if (ctx.role !== 'SUPERVISOR' && ctx.role !== 'SITE_MANAGER') {
    forbidScope('Only the supervisor or the SM record diesel stock');
  }
  if (!ctx.siteIds.includes(siteId)) forbidScope('Site is outside your scope');
}

function mapPurchase(r: typeof schema.fuelStockPurchases.$inferSelect): FuelStockPurchase {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    litres: r.litres,
    amountPaise: r.amountPaise ?? null,
    receiptMediaId: r.receiptMediaId ?? null,
    purchasedBy: r.purchasedBy,
    businessDate: r.businessDate,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapIssuance(r: typeof schema.fuelIssuances.$inferSelect): FuelIssuance {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    vehicleId: r.vehicleId,
    litres: r.litres,
    issuedBy: r.issuedBy,
    businessDate: r.businessDate,
    status: r.status,
    matchedFuelLogId: r.matchedFuelLogId ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
