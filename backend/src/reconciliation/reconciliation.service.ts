import { Injectable } from '@nestjs/common';
import { and, gte, isNull, lte, type AnyColumn } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import {
  type DateWindow,
  type FuelReconRow,
  type MaterialReconRow,
  type Reconciliation,
} from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { loadOrgConfig } from '../common/org-config.util';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';

const FUEL_VARIANCE_FLAG = 0.15; // 15%

@Injectable()
export class ReconciliationService {
  constructor(private readonly dbs: DbService) {}

  async getReconciliation(p: Principal, window: DateWindow): Promise<Reconciliation> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      // WP-1: reconciliation is an org/site oversight surface — Owner org-wide, SM their
      // site(s); crew/vehicle/self-scoped roles are denied.
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} has no reconciliation view`);
      }
      const siteIds = ctx.role === 'OWNER' ? undefined : ctx.siteIds;

      const inWindow = (col: AnyColumn) => and(gte(col, window.from), lte(col, window.to));

      // ---- material reconciliation: opening + IN − CONSUME − DISPATCH + RECEIVE ----
      const balances = await tx
        .select()
        .from(schema.materialBalances)
        .where(siteIds ? inSet(schema.materialBalances.siteId, siteIds) : undefined);
      const txns = await tx
        .select()
        .from(schema.materialTxns)
        .where(
          and(
            isNull(schema.materialTxns.deletedAt),
            inWindow(schema.materialTxns.businessDate),
            siteIds ? inSet(schema.materialTxns.siteId, siteIds) : undefined,
          ),
        );

      const key = (siteId: string, materialId: string) => `${siteId}::${materialId}`;
      const mat = new Map<string, MaterialReconRow>();
      const ensure = (siteId: string, materialId: string): MaterialReconRow => {
        const k = key(siteId, materialId);
        let r = mat.get(k);
        if (!r) {
          r = { siteId, materialId, opening: 0, inQty: 0, consumed: 0, dispatched: 0, received: 0, balance: 0, negativeFlag: false };
          mat.set(k, r);
        }
        return r;
      };
      for (const b of balances) ensure(b.siteId, b.materialId).opening = b.opening;
      for (const t of txns) {
        const r = ensure(t.siteId, t.materialId);
        if (t.type === 'IN') r.inQty += t.qty;
        else if (t.type === 'CONSUME') r.consumed += t.qty;
        else if (t.type === 'DISPATCH') r.dispatched += t.qty;
        else if (t.type === 'RECEIVE') r.received += t.qty;
      }
      const material: MaterialReconRow[] = [];
      for (const r of mat.values()) {
        r.balance = r.opening + r.inQty - r.consumed - r.dispatched + r.received;
        r.negativeFlag = r.balance < 0;
        material.push(r);
      }

      // ---- fuel reconciliation: expected (norm × distance/hours) vs actual litres ----
      const cfg = await loadOrgConfig(tx);
      const fuelNorms = cfg.reconciliation.fuelNorms;
      const vtypes = await tx.select().from(schema.vehicleTypes);
      const normOf = new Map<string, number>(); // vehicleTypeId → norm (best-effort match by type name)
      for (const vt of vtypes) {
        const n = fuelNorms[vt.name] ?? fuelNorms[vt.name.toLowerCase()];
        if (typeof n === 'number') normOf.set(vt.id, n);
      }
      const vehicles = await tx
        .select()
        .from(schema.vehicles)
        .where(
          and(isNull(schema.vehicles.deletedAt), siteIds ? inSet(schema.vehicles.assignedSiteId, siteIds) : undefined),
        );
      const typeOfVehicle = new Map(vehicles.map((v) => [v.id, v.vehicleTypeId]));
      const scopedVehicleIds = vehicles.map((v) => v.id);

      const fuelRows = await tx
        .select()
        .from(schema.fuelLogs)
        .where(
          and(
            isNull(schema.fuelLogs.deletedAt),
            inWindow(schema.fuelLogs.businessDate),
            siteIds ? inSet(schema.fuelLogs.vehicleId, scopedVehicleIds) : undefined,
          ),
        );
      const logRows = await tx
        .select()
        .from(schema.vehicleLogs)
        .where(
          and(
            isNull(schema.vehicleLogs.deletedAt),
            inWindow(schema.vehicleLogs.businessDate),
            siteIds ? inSet(schema.vehicleLogs.vehicleId, scopedVehicleIds) : undefined,
          ),
        );

      const actual = new Map<string, number>();
      for (const f of fuelRows) actual.set(f.vehicleId, (actual.get(f.vehicleId) ?? 0) + f.litres);
      const distance = new Map<string, number>();
      for (const l of logRows) {
        if (l.endReading == null) continue;
        distance.set(l.vehicleId, (distance.get(l.vehicleId) ?? 0) + Math.max(0, l.endReading - l.startReading));
      }

      const fuel: FuelReconRow[] = [];
      const vehicleIds = new Set<string>([...actual.keys(), ...distance.keys()]);
      for (const vehicleId of vehicleIds) {
        const actualLitres = actual.get(vehicleId) ?? 0;
        const dist = distance.get(vehicleId) ?? 0;
        const typeId = typeOfVehicle.get(vehicleId);
        const norm = typeId ? normOf.get(typeId) : undefined;
        const expectedLitres = norm ? norm * dist : 0;
        const variancePct = expectedLitres > 0 ? (actualLitres - expectedLitres) / expectedLitres : 0;
        fuel.push({
          vehicleId,
          expectedLitres,
          actualLitres,
          variancePct,
          flagged: expectedLitres > 0 && Math.abs(variancePct) > FUEL_VARIANCE_FLAG,
        });
      }

      return { window, fuel, material };
    });
  }
}
