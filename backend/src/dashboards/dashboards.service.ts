import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, type AnyColumn, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Completeness, CostRollup, DateWindow, OwnerDashboard } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { dayKey, deriveCompleteness } from './completeness-rule';

/**
 * WP-1: dashboards are an org/site-level surface — Owner sees the org, an SM sees a
 * site-filtered version of the same dashboard; crew/vehicle/self-scoped roles have no
 * meaningful org dashboard and are denied.
 */
function dashboardScope(ctx: ScopeContext): { siteIds: string[] | undefined; crewIds: string[] } {
  if (ctx.role === 'OWNER') return { siteIds: undefined, crewIds: [] };
  if (ctx.role === 'SITE_MANAGER') return { siteIds: ctx.siteIds, crewIds: ctx.crewIds };
  forbidScope(`Role ${ctx.role} has no org/site dashboard`);
}

@Injectable()
export class DashboardsService {
  constructor(private readonly dbs: DbService) {}

  async getCompleteness(p: Principal, window: DateWindow): Promise<Completeness[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const { siteIds } = dashboardScope(await loadScope(tx, p));
      return computeCompleteness(tx, p.orgId, window, siteIds);
    });
  }

  async getOwnerDashboard(p: Principal, window: DateWindow): Promise<OwnerDashboard> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const { siteIds, crewIds } = dashboardScope(await loadScope(tx, p));
      const today = window.to;
      const inWin = (col: AnyColumn) => and(gte(col, window.from), lte(col, window.to));
      const bySite = (col: AnyColumn): SQL | undefined => (siteIds ? inSet(col, siteIds) : undefined);
      /** vehicle-stamped tables: restrict to vehicles at the scoped sites */
      const byVehicleSite = (col: AnyColumn): SQL | undefined =>
        siteIds
          ? (inArray(
              col,
              tx
                .select({ id: schema.vehicles.id })
                .from(schema.vehicles)
                .where(and(isNull(schema.vehicles.deletedAt), inSet(schema.vehicles.assignedSiteId, siteIds))),
            ) as SQL)
          : undefined;

      const sites = await tx
        .select()
        .from(schema.sites)
        .where(and(isNull(schema.sites.deletedAt), siteIds ? inSet(schema.sites.id, siteIds) : undefined));
      const activeSites = sites.filter((s) => s.status === 'ACTIVE').length;

      const attToday = await tx
        .select({ status: schema.attendance.status })
        .from(schema.attendance)
        .where(
          and(
            isNull(schema.attendance.deletedAt),
            eq(schema.attendance.businessDate, today),
            bySite(schema.attendance.siteId),
          ),
        );
      const headcountToday = attToday.filter((a) => a.status === 'PRESENT' || a.status === 'HALF_DAY').length;

      const logsToday = await tx
        .select({ vehicleId: schema.vehicleLogs.vehicleId })
        .from(schema.vehicleLogs)
        .where(
          and(
            isNull(schema.vehicleLogs.deletedAt),
            eq(schema.vehicleLogs.businessDate, today),
            byVehicleSite(schema.vehicleLogs.vehicleId),
          ),
        );
      const vehiclesActiveToday = new Set(logsToday.map((l) => l.vehicleId)).size;

      const expToday = await tx
        .select({ amt: schema.expenses.amountPaise })
        .from(schema.expenses)
        .where(
          and(
            isNull(schema.expenses.deletedAt),
            eq(schema.expenses.businessDate, today),
            eq(schema.expenses.void, false),
            bySite(schema.expenses.siteId),
          ),
        );
      const fuelToday = await tx
        .select({ amt: schema.fuelLogs.amountPaise })
        .from(schema.fuelLogs)
        .where(
          and(
            isNull(schema.fuelLogs.deletedAt),
            eq(schema.fuelLogs.businessDate, today),
            byVehicleSite(schema.fuelLogs.vehicleId),
          ),
        );
      const spendTodayPaise =
        expToday.reduce((s, x) => s + x.amt, 0) + fuelToday.reduce((s, x) => s + (x.amt ?? 0), 0);

      const openIssuesRows = await tx
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(and(isNull(schema.issues.deletedAt), eq(schema.issues.status, 'OPEN'), bySite(schema.issues.siteId)));
      const pendingApprovalRows = await tx
        .select({ id: schema.approvalRequests.id })
        .from(schema.approvalRequests)
        .where(
          and(
            isNull(schema.approvalRequests.deletedAt),
            eq(schema.approvalRequests.status, 'PENDING'),
            siteIds
              ? (inArray(
                  schema.approvalRequests.requestedBy,
                  tx
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .where(and(isNull(schema.users.deletedAt), inSet(schema.users.assignedSiteId, siteIds))),
                ) as SQL)
              : undefined,
          ),
        );

      // cost rollups over the window
      const exp = await tx
        .select({ siteId: schema.expenses.siteId, amt: schema.expenses.amountPaise })
        .from(schema.expenses)
        .where(
          and(
            isNull(schema.expenses.deletedAt),
            eq(schema.expenses.void, false),
            inWin(schema.expenses.businessDate),
            bySite(schema.expenses.siteId),
          ),
        );
      const fuel = await tx
        .select({ vehicleId: schema.fuelLogs.vehicleId, amt: schema.fuelLogs.amountPaise })
        .from(schema.fuelLogs)
        .where(and(isNull(schema.fuelLogs.deletedAt), inWin(schema.fuelLogs.businessDate), byVehicleSite(schema.fuelLogs.vehicleId)));
      const advByCrew = await tx
        .select({ crewId: schema.advances.crewId, amt: schema.advances.amountPaise })
        .from(schema.advances)
        .where(
          and(
            isNull(schema.advances.deletedAt),
            inWin(schema.advances.businessDate),
            siteIds ? inSet(schema.advances.crewId, crewIds) : undefined,
          ),
        );
      const matUse = await tx
        .select({ materialId: schema.materialTxns.materialId, qty: schema.materialTxns.qty, uom: schema.materialTxns.uom, type: schema.materialTxns.type })
        .from(schema.materialTxns)
        .where(
          and(
            isNull(schema.materialTxns.deletedAt),
            eq(schema.materialTxns.type, 'CONSUME'),
            inWin(schema.materialTxns.businessDate),
            bySite(schema.materialTxns.siteId),
          ),
        );

      const costRollup: CostRollup = {
        bySite: rollup(exp, (x) => x.siteId, (x) => x.amt).map(([siteId, totalPaise]) => ({ siteId, totalPaise })),
        byVehicle: rollup(fuel, (x) => x.vehicleId, (x) => x.amt ?? 0).map(([vehicleId, totalPaise]) => ({ vehicleId, totalPaise })),
        byCrew: rollup(advByCrew.filter((x) => x.crewId), (x) => x.crewId as string, (x) => x.amt).map(([crewId, totalPaise]) => ({ crewId, totalPaise })),
        byMaterial: rollup(matUse, (x) => x.materialId, (x) => x.qty).map(([materialId, qty]) => ({ materialId, qty, uom: matUse.find((m) => m.materialId === materialId)?.uom ?? 'NOS' })),
      };

      const completeness = await computeCompleteness(tx, p.orgId, window, siteIds);

      return {
        window,
        kpis: {
          activeSites,
          headcountToday,
          vehiclesActiveToday,
          spendTodayPaise,
          openIssues: openIssuesRows.length,
          pendingApprovals: pendingApprovalRows.length,
        },
        completeness,
        costRollup,
      };
    });
  }
}

function rollup<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + valFn(r));
  return [...m.entries()];
}

/** SITE completeness — DB reads here, pure rule in completeness-rule.ts (WP-5 unit-tested). */
async function computeCompleteness(tx: Tx, orgId: string, window: DateWindow, siteIds?: string[]): Promise<Completeness[]> {
  const sites = await tx
    .select()
    .from(schema.sites)
    .where(and(isNull(schema.sites.deletedAt), siteIds ? inSet(schema.sites.id, siteIds) : undefined));
  const holidays = await tx.select().from(schema.siteHolidays);
  const att = await tx
    .select({ siteId: schema.attendance.siteId, d: schema.attendance.businessDate })
    .from(schema.attendance)
    .where(and(isNull(schema.attendance.deletedAt), gte(schema.attendance.businessDate, window.from), lte(schema.attendance.businessDate, window.to)));
  const prog = await tx
    .select({ siteId: schema.progressNotes.siteId, d: schema.progressNotes.businessDate })
    .from(schema.progressNotes)
    .where(and(isNull(schema.progressNotes.deletedAt), gte(schema.progressNotes.businessDate, window.from), lte(schema.progressNotes.businessDate, window.to)));

  return deriveCompleteness(
    orgId,
    sites,
    new Set(holidays.map((h) => dayKey(h.siteId, h.date))),
    new Set(att.map((a) => dayKey(a.siteId, a.d))),
    new Set(prog.map((x) => dayKey(x.siteId, x.d))),
    window,
  );
}
