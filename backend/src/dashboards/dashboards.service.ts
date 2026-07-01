import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, type AnyColumn } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Completeness, CostRollup, DateWindow, OwnerDashboard } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import type { Principal } from '../common/current-user.decorator';

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let guard = 0;
  while (d <= end && guard < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}
const dow = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

@Injectable()
export class DashboardsService {
  constructor(private readonly dbs: DbService) {}

  async getCompleteness(p: Principal, window: DateWindow): Promise<Completeness[]> {
    return this.dbs.runInTenant(p.orgId, (tx) => computeCompleteness(tx, p.orgId, window));
  }

  async getOwnerDashboard(p: Principal, window: DateWindow): Promise<OwnerDashboard> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const today = window.to;
      const inWin = (col: AnyColumn) => and(gte(col, window.from), lte(col, window.to));

      const sites = await tx.select().from(schema.sites).where(isNull(schema.sites.deletedAt));
      const activeSites = sites.filter((s) => s.status === 'ACTIVE').length;

      const attToday = await tx
        .select({ status: schema.attendance.status })
        .from(schema.attendance)
        .where(and(isNull(schema.attendance.deletedAt), eq(schema.attendance.businessDate, today)));
      const headcountToday = attToday.filter((a) => a.status === 'PRESENT' || a.status === 'HALF_DAY').length;

      const logsToday = await tx
        .select({ vehicleId: schema.vehicleLogs.vehicleId })
        .from(schema.vehicleLogs)
        .where(and(isNull(schema.vehicleLogs.deletedAt), eq(schema.vehicleLogs.businessDate, today)));
      const vehiclesActiveToday = new Set(logsToday.map((l) => l.vehicleId)).size;

      const expToday = await tx
        .select({ amt: schema.expenses.amountPaise })
        .from(schema.expenses)
        .where(and(isNull(schema.expenses.deletedAt), eq(schema.expenses.businessDate, today), eq(schema.expenses.void, false)));
      const fuelToday = await tx
        .select({ amt: schema.fuelLogs.amountPaise })
        .from(schema.fuelLogs)
        .where(and(isNull(schema.fuelLogs.deletedAt), eq(schema.fuelLogs.businessDate, today)));
      const spendTodayPaise =
        expToday.reduce((s, x) => s + x.amt, 0) + fuelToday.reduce((s, x) => s + x.amt, 0);

      const openIssuesRows = await tx
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .where(and(isNull(schema.issues.deletedAt), eq(schema.issues.status, 'OPEN')));
      const pendingApprovalRows = await tx
        .select({ id: schema.approvalRequests.id })
        .from(schema.approvalRequests)
        .where(and(isNull(schema.approvalRequests.deletedAt), eq(schema.approvalRequests.status, 'PENDING')));

      // cost rollups over the window
      const exp = await tx
        .select({ siteId: schema.expenses.siteId, amt: schema.expenses.amountPaise })
        .from(schema.expenses)
        .where(and(isNull(schema.expenses.deletedAt), eq(schema.expenses.void, false), inWin(schema.expenses.businessDate)));
      const fuel = await tx
        .select({ vehicleId: schema.fuelLogs.vehicleId, amt: schema.fuelLogs.amountPaise })
        .from(schema.fuelLogs)
        .where(and(isNull(schema.fuelLogs.deletedAt), inWin(schema.fuelLogs.businessDate)));
      const advByCrew = await tx
        .select({ crewId: schema.advances.crewId, amt: schema.advances.amountPaise })
        .from(schema.advances)
        .where(and(isNull(schema.advances.deletedAt), inWin(schema.advances.businessDate)));
      const matUse = await tx
        .select({ materialId: schema.materialTxns.materialId, qty: schema.materialTxns.qty, uom: schema.materialTxns.uom, type: schema.materialTxns.type })
        .from(schema.materialTxns)
        .where(and(isNull(schema.materialTxns.deletedAt), eq(schema.materialTxns.type, 'CONSUME'), inWin(schema.materialTxns.businessDate)));

      const costRollup: CostRollup = {
        bySite: rollup(exp, (x) => x.siteId, (x) => x.amt).map(([siteId, totalPaise]) => ({ siteId, totalPaise })),
        byVehicle: rollup(fuel, (x) => x.vehicleId, (x) => x.amt).map(([vehicleId, totalPaise]) => ({ vehicleId, totalPaise })),
        byCrew: rollup(advByCrew.filter((x) => x.crewId), (x) => x.crewId as string, (x) => x.amt).map(([crewId, totalPaise]) => ({ crewId, totalPaise })),
        byMaterial: rollup(matUse, (x) => x.materialId, (x) => x.qty).map(([materialId, qty]) => ({ materialId, qty, uom: matUse.find((m) => m.materialId === materialId)?.uom ?? 'NOS' })),
      };

      const completeness = await computeCompleteness(tx, p.orgId, window);

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

/** SITE completeness: COMPLETE = attendance AND progress for an active site on a working day; PARTIAL = one; MISSING = none. */
async function computeCompleteness(tx: Tx, _orgId: string, window: DateWindow): Promise<Completeness[]> {
  const sites = await tx.select().from(schema.sites).where(isNull(schema.sites.deletedAt));
  const active = sites.filter((s) => s.status === 'ACTIVE');
  const holidays = await tx.select().from(schema.siteHolidays);
  const holidaySet = new Set(holidays.map((h) => `${h.siteId}::${h.date}`));

  const att = await tx
    .select({ siteId: schema.attendance.siteId, d: schema.attendance.businessDate })
    .from(schema.attendance)
    .where(and(isNull(schema.attendance.deletedAt), gte(schema.attendance.businessDate, window.from), lte(schema.attendance.businessDate, window.to)));
  const prog = await tx
    .select({ siteId: schema.progressNotes.siteId, d: schema.progressNotes.businessDate })
    .from(schema.progressNotes)
    .where(and(isNull(schema.progressNotes.deletedAt), gte(schema.progressNotes.businessDate, window.from), lte(schema.progressNotes.businessDate, window.to)));
  const attSet = new Set(att.map((a) => `${a.siteId}::${a.d}`));
  const progSet = new Set(prog.map((x) => `${x.siteId}::${x.d}`));

  const out: Completeness[] = [];
  for (const s of active) {
    const weeklyOff = s.weeklyOff ?? [];
    for (const date of eachDate(window.from, window.to)) {
      if (weeklyOff.includes(dow(date)) || holidaySet.has(`${s.id}::${date}`)) continue;
      const k = `${s.id}::${date}`;
      const hasAtt = attSet.has(k);
      const hasProg = progSet.has(k);
      const state = hasAtt && hasProg ? 'COMPLETE' : hasAtt || hasProg ? 'PARTIAL' : 'MISSING';
      out.push({ orgId: _orgId, scopeType: 'SITE', scopeId: s.id, businessDate: date, state });
    }
  }
  return out;
}
