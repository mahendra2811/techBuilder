/**
 * Round 2 (CW-3) — the ACCOUNTANT's screen is a WORK QUEUE, not analytics (client decision):
 * pending money requests · unverified money rows awaiting his tick · diesel 🚩 flags ·
 * what he decided/verified today · cash in his own hands. NO weekly/monthly rollups here —
 * insights belong to the SM + Owner. Composes the other modules' already-scoped reads.
 */
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { AccountantQueue } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { businessDateNow } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';
import { CashTransfersService } from '../cash-transfers/cash-transfers.service';
import { FuelStockService } from '../fuel-stock/fuel-stock.service';

@Injectable()
export class AccountantService {
  constructor(
    private readonly dbs: DbService,
    private readonly cash: CashTransfersService,
    private readonly fuel: FuelStockService,
  ) {}

  async queue(p: Principal): Promise<AccountantQueue> {
    const [core, fuelFlags, myBalance] = await Promise.all([
      this.dbs.runInTenant(p.orgId, async (tx) => {
        const ctx = await loadScope(tx, p);
        if (ctx.role !== 'ACCOUNTANT' && ctx.role !== 'OWNER') {
          forbidScope('The work queue belongs to the accountant (or the Owner)');
        }
        // Pending money requests on his sites (payload.siteId is server-derived at submit).
        const pendingRequests = await tx
          .select()
          .from(schema.approvalRequests)
          .where(
            and(
              isNull(schema.approvalRequests.deletedAt),
              eq(schema.approvalRequests.type, 'EXPENSE_ADD'),
              eq(schema.approvalRequests.status, 'PENDING'),
              ctx.role === 'OWNER'
                ? undefined
                : inArray(sql`(${schema.approvalRequests.payload} ->> 'siteId')`, ctx.siteIds.length ? ctx.siteIds : ['-']),
            ),
          )
          .orderBy(desc(schema.approvalRequests.createdAt));

        // Booked money awaiting his tick (flagged rows already acted on — the Owner resolves those).
        const unverifiedExpenses = await tx
          .select()
          .from(schema.expenses)
          .where(
            and(
              isNull(schema.expenses.deletedAt),
              eq(schema.expenses.void, false),
              isNull(schema.expenses.verifiedAt),
              eq(schema.expenses.flagged, false),
              ctx.role === 'OWNER' ? undefined : inSet(schema.expenses.siteId, ctx.siteIds),
            ),
          )
          .orderBy(desc(schema.expenses.businessDate));

        // Cash-transfer claims touching his sites' people: assigned-site users ∪ users whose
        // person drives a vehicle at his sites (drivers carry no assignedSiteId).
        let partyFilter: SQL | undefined;
        if (ctx.role !== 'OWNER') {
          const assigned = await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(and(isNull(schema.users.deletedAt), inSet(schema.users.assignedSiteId, ctx.siteIds)));
          const driverPersons = await tx
            .select({ personId: schema.vehicles.assignedDriverPersonId })
            .from(schema.vehicles)
            .where(and(isNull(schema.vehicles.deletedAt), inSet(schema.vehicles.assignedSiteId, ctx.siteIds)));
          const personIds = driverPersons.map((d) => d.personId).filter((x): x is string => !!x);
          const driverUsers = personIds.length
            ? await tx
                .select({ id: schema.users.id })
                .from(schema.users)
                .where(and(isNull(schema.users.deletedAt), inSet(schema.users.personId, personIds)))
            : [];
          const userIds = [...new Set([...assigned.map((u) => u.id), ...driverUsers.map((u) => u.id)])];
          const scoped = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'];
          partyFilter = sql`(${inArray(schema.cashTransfers.fromUserId, scoped)} OR ${inArray(schema.cashTransfers.toUserId, scoped)})` as SQL;
        }
        const unverifiedTransfers = await tx
          .select()
          .from(schema.cashTransfers)
          .where(
            and(
              isNull(schema.cashTransfers.deletedAt),
              isNull(schema.cashTransfers.verifiedAt),
              eq(schema.cashTransfers.flagged, false),
              partyFilter,
            ),
          )
          .orderBy(desc(schema.cashTransfers.businessDate));

        const unverifiedVendorPayments = await tx
          .select({ vp: schema.vendorPayments })
          .from(schema.vendorPayments)
          .innerJoin(schema.vendors, eq(schema.vendors.id, schema.vendorPayments.vendorId))
          .where(
            and(
              isNull(schema.vendorPayments.deletedAt),
              isNull(schema.vendorPayments.verifiedAt),
              eq(schema.vendorPayments.flagged, false),
              ctx.role === 'OWNER' ? undefined : inSet(schema.vendors.siteId, ctx.siteIds),
            ),
          )
          .orderBy(desc(schema.vendorPayments.businessDate));

        // Today's activity counters (business-day boundary, Asia/Kolkata).
        const today = businessDateNow(new Date(), await loadEodCutoff(tx));
        const dayStart = new Date(`${today}T00:00:00+05:30`);
        const decided = await tx
          .select({ status: schema.approvalRequests.status, n: sql<string>`count(*)` })
          .from(schema.approvalRequests)
          .where(and(eq(schema.approvalRequests.approverUserId, ctx.userId), gte(schema.approvalRequests.decidedAt, dayStart)))
          .groupBy(schema.approvalRequests.status);
        const decidedToday = {
          approved: Number(decided.find((d) => d.status === 'APPROVED')?.n ?? 0),
          rejected: Number(decided.find((d) => d.status === 'REJECTED')?.n ?? 0),
          verified: 0,
        };
        for (const t of [schema.expenses, schema.cashTransfers, schema.vendorPayments] as const) {
          const [r] = await tx
            .select({ n: sql<string>`count(*)` })
            .from(t)
            .where(and(eq(t.verifiedBy, ctx.userId), gte(t.verifiedAt, dayStart)));
          decidedToday.verified += Number(r?.n ?? 0);
        }

        return {
          pendingRequests: pendingRequests.map(mapRequest),
          unverifiedExpenses: unverifiedExpenses.map(mapExpense),
          unverifiedTransfers,
          unverifiedVendorPayments: unverifiedVendorPayments.map((r) => r.vp),
          decidedToday,
        };
      }),
      this.fuel.matchFlags(p),
      this.cash.myBalance(p),
    ]);

    return {
      pendingRequests: core.pendingRequests,
      unverifiedExpenses: core.unverifiedExpenses,
      unverifiedTransfers: core.unverifiedTransfers.map(mapTransfer),
      unverifiedVendorPayments: core.unverifiedVendorPayments.map(mapVendorPayment),
      fuelFlags,
      decidedToday: core.decidedToday,
      cashInHandPaise: myBalance.balancePaise,
    };
  }
}

// Slim row→domain mappers (verification passthrough included).
function auditOf(r: { createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; version: number; id: string }) {
  return {
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
function verificationOf(r: { verifiedBy: string | null; verifiedAt: Date | null; flagged: boolean; flagNote: string | null }) {
  return {
    verifiedBy: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    flagged: r.flagged,
    flagNote: r.flagNote ?? null,
  };
}
function mapRequest(r: typeof schema.approvalRequests.$inferSelect) {
  return {
    id: r.id, orgId: r.orgId, type: r.type, payload: r.payload as Record<string, unknown>, status: r.status,
    requestedBy: r.requestedBy, approverUserId: r.approverUserId ?? null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null, comment: r.comment ?? null,
    ...auditOf(r), ...verificationOf(r),
  };
}
function mapExpense(r: typeof schema.expenses.$inferSelect) {
  return {
    id: r.id, orgId: r.orgId, siteId: r.siteId, category: r.category, amountPaise: r.amountPaise,
    vendorId: r.vendorId ?? null, billNo: r.billNo ?? null, receiptMediaId: r.receiptMediaId ?? null,
    paidVia: r.paidVia, remark: r.remark ?? null, businessDate: r.businessDate, enteredBy: r.enteredBy, void: r.void,
    ...auditOf(r), ...verificationOf(r),
  };
}
function mapTransfer(r: typeof schema.cashTransfers.$inferSelect) {
  return {
    id: r.id, orgId: r.orgId, fromUserId: r.fromUserId, toUserId: r.toUserId, amountPaise: r.amountPaise,
    kind: r.kind, tag: r.tag, businessDate: r.businessDate, note: r.note ?? null,
    ...auditOf(r), ...verificationOf(r),
  };
}
function mapVendorPayment(r: typeof schema.vendorPayments.$inferSelect) {
  return {
    id: r.id, orgId: r.orgId, vendorId: r.vendorId, kind: r.kind, amountPaise: r.amountPaise,
    businessDate: r.businessDate, note: r.note ?? null,
    ...auditOf(r), ...verificationOf(r),
  };
}
