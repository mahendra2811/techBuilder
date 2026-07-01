import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import {
  parseOrgConfig,
  type Advance,
  type CreateAdvanceInput,
  type DateWindow,
  type SetWageRateInput,
  type WageRate,
  type WageSummary,
  type WageSummaryRow,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class WageService {
  constructor(private readonly dbs: DbService) {}

  async setWageRate(p: Principal, input: SetWageRateInput): Promise<WageRate> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.wageRates)
        .values({
          id: input.id,
          orgId: p.orgId,
          personId: input.personId,
          dailyPaise: input.dailyPaise,
          effectiveFrom: input.effectiveFrom,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.wageRates).where(eq(schema.wageRates.id, input.id));
        if (existing) return mapWageRate(existing);
        throw new ApiException('CONFLICT', 'Could not set wage rate');
      }
      return mapWageRate(row);
    });
  }

  async createAdvance(p: Principal, input: CreateAdvanceInput): Promise<Advance> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.advances)
        .values({
          id: input.id,
          orgId: p.orgId,
          personId: input.personId ?? null,
          crewId: input.crewId ?? null,
          amountPaise: input.amountPaise,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.advances).where(eq(schema.advances.id, input.id));
        if (existing) return mapAdvance(existing);
        throw new ApiException('CONFLICT', 'Could not create advance');
      }
      return mapAdvance(row);
    });
  }

  /** Read-only wage/cost summary. NOT a payment rail. net = round(rate × (present + 0.5·half)) + OT − person advances. */
  async getWageSummary(p: Principal, window: DateWindow): Promise<WageSummary> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const otMultiplier = await loadOtMultiplier(tx, p.orgId);

      const att = await tx
        .select()
        .from(schema.attendance)
        .where(
          and(
            isNull(schema.attendance.deletedAt),
            gte(schema.attendance.businessDate, window.from),
            lte(schema.attendance.businessDate, window.to),
          ),
        );
      const people = await tx.select().from(schema.people).where(isNull(schema.people.deletedAt));
      const rates = await tx
        .select()
        .from(schema.wageRates)
        .where(and(isNull(schema.wageRates.deletedAt), lte(schema.wageRates.effectiveFrom, window.to)));
      const advs = await tx
        .select()
        .from(schema.advances)
        .where(
          and(
            isNull(schema.advances.deletedAt),
            gte(schema.advances.businessDate, window.from),
            lte(schema.advances.businessDate, window.to),
          ),
        );

      const nameOf = new Map(people.map((x) => [x.id, x.name]));
      const defaultRateOf = new Map(people.map((x) => [x.id, x.defaultWagePaise]));
      // latest effective rate per person (effectiveFrom <= window.to)
      const rateOf = new Map<string, number>();
      const rateAsOf = new Map<string, string>();
      for (const r of rates) {
        const prev = rateAsOf.get(r.personId);
        if (!prev || r.effectiveFrom > prev) {
          rateAsOf.set(r.personId, r.effectiveFrom);
          rateOf.set(r.personId, r.dailyPaise);
        }
      }
      const advanceOf = new Map<string, number>();
      for (const a of advs) {
        if (!a.personId) continue; // crew-level advances are not allocated per-person in this summary
        advanceOf.set(a.personId, (advanceOf.get(a.personId) ?? 0) + a.amountPaise);
      }

      type Agg = { present: number; half: number; ot: number; siteId: string; crewId: string | null };
      const agg = new Map<string, Agg>();
      for (const a of att) {
        const cur = agg.get(a.personId) ?? { present: 0, half: 0, ot: 0, siteId: a.siteId, crewId: a.crewId };
        if (a.status === 'PRESENT') cur.present += 1;
        else if (a.status === 'HALF_DAY') cur.half += 1;
        cur.ot += a.otHours ?? 0;
        cur.siteId = a.siteId;
        cur.crewId = a.crewId;
        agg.set(a.personId, cur);
      }

      const rows: WageSummaryRow[] = [];
      let grossT = 0;
      let advT = 0;
      for (const [personId, x] of agg) {
        const rate = rateOf.get(personId) ?? defaultRateOf.get(personId) ?? 0;
        const base = Math.round(rate * (x.present + 0.5 * x.half));
        const otPay = Math.round(x.ot * (rate / 8) * otMultiplier);
        const gross = base + otPay;
        const advance = advanceOf.get(personId) ?? 0;
        const net = gross - advance;
        grossT += gross;
        advT += advance;
        rows.push({
          personId,
          personName: nameOf.get(personId) ?? '(unknown)',
          crewId: x.crewId,
          siteId: x.siteId,
          presentDays: x.present,
          halfDays: x.half,
          otHours: x.ot,
          ratePaise: rate,
          grossPayablePaise: gross,
          advancePaise: advance,
          netPayablePaise: net,
        });
      }
      rows.sort((a, b) => a.personName.localeCompare(b.personName));
      return { window, rows, totals: { grossPaise: grossT, advancePaise: advT, netPaise: grossT - advT } };
    });
  }
}

async function loadOtMultiplier(tx: Tx, orgId: string): Promise<number> {
  const [o] = await tx.select({ config: schema.orgs.config }).from(schema.orgs).where(eq(schema.orgs.id, orgId));
  if (!o) return 1.5;
  return parseOrgConfig(o.config).wage.otMultiplier;
}

function mapWageRate(r: typeof schema.wageRates.$inferSelect): WageRate {
  return {
    id: r.id,
    orgId: r.orgId,
    personId: r.personId,
    dailyPaise: r.dailyPaise,
    effectiveFrom: r.effectiveFrom,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapAdvance(a: typeof schema.advances.$inferSelect): Advance {
  return {
    id: a.id,
    orgId: a.orgId,
    personId: a.personId,
    crewId: a.crewId,
    amountPaise: a.amountPaise,
    businessDate: a.businessDate,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    createdBy: a.createdBy ?? a.id,
    updatedBy: a.updatedBy ?? a.id,
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    version: a.version,
  };
}
