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
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { computeWageRows } from './wage-calc';

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
      // WP-1: an SM gives advances only to persons/crews inside their site scope.
      const ctx = await loadScope(tx, p);
      if (ctx.role === 'SITE_MANAGER') {
        if (input.personId && !ctx.crewPersonIds.includes(input.personId)) {
          forbidScope('Person is outside your site scope');
        }
        if (input.crewId && !ctx.crewIds.includes(input.crewId)) {
          forbidScope('Crew is outside your site scope');
        }
      }
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

      // WP-1: the summary aggregates from attendance, which is site-stamped — an SM's
      // summary is therefore their site(s) only. Owner sees the org.
      const ctx = await loadScope(tx, p);
      const siteScope =
        ctx.role === 'OWNER' ? undefined : inSet(schema.attendance.siteId, ctx.siteIds);

      const att = await tx
        .select()
        .from(schema.attendance)
        .where(
          and(
            isNull(schema.attendance.deletedAt),
            siteScope,
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

      // Pure math lives in wage-calc.ts (WP-5: unit-tested against hand-computed fixtures).
      const { rows, totals } = computeWageRows(att, people, rates, advs, otMultiplier);
      return { window, rows, totals };
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
