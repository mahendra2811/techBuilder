import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateVendorInput, CreateVendorPaymentInput, Vendor, VendorLedger, VendorPayment } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';

/**
 * WO-10: vendor / shop accounts (udhaar khata). NOT wired into the RBAC `ACTIONS`
 * matrix (no `vendor.*` action exists) — every method enforces its own
 * role + scope rule directly, per the WO. Mirrors the `sites/` tenant+scope+CRUD
 * shape otherwise (runInTenant, client-UUID idempotent insert, mapXxx).
 */
@Injectable()
export class VendorsService {
  constructor(private readonly dbs: DbService) {}

  /**
   * Any authenticated user may list vendors — workers/drivers need this for the
   * "paid by cash / on credit" shop picker on the expense forms. Visible set:
   * org-wide vendors (siteId null) + vendors at the caller's scoped sites.
   * OWNER sees every vendor in the org (no filter needed).
   */
  async list(p: Principal): Promise<Vendor[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const scope: SQL | undefined =
        ctx.role === 'OWNER' ? undefined : (or(isNull(schema.vendors.siteId), inSet(schema.vendors.siteId, ctx.siteIds)) as SQL);
      const rows = await tx
        .select()
        .from(schema.vendors)
        .where(and(isNull(schema.vendors.deletedAt), scope))
        .orderBy(asc(schema.vendors.name));
      return rows.map(mapVendor);
    });
  }

  /** OWNER (any site, or org-wide with siteId omitted) or SITE_MANAGER (own site only). */
  async create(p: Principal, input: CreateVendorInput): Promise<Vendor> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot add a vendor`);
      }

      let siteId: string | null;
      if (ctx.role === 'OWNER') {
        siteId = input.siteId ?? null;
      } else {
        siteId = input.siteId ?? ctx.siteIds[0] ?? null;
        if (!siteId) forbidScope('No site assigned — ask the Owner');
        if (!ctx.siteIds.includes(siteId)) forbidScope('Site out of scope');
      }

      const [row] = await tx
        .insert(schema.vendors)
        .values({
          id: input.id,
          orgId: p.orgId,
          siteId,
          name: input.name,
          phone: input.phone ?? null,
          sells: input.sells ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.vendors).where(eq(schema.vendors.id, input.id));
        if (existing) return mapVendor(existing);
        throw new ApiException('CONFLICT', 'Could not create vendor');
      }
      return mapVendor(row);
    });
  }

  /** OWNER (any vendor) or SITE_MANAGER (vendor's site must be one of his — org-wide
   *  vendors, siteId null, are Owner-only for payments). */
  async createPayment(p: Principal, vendorId: string, input: Omit<CreateVendorPaymentInput, 'vendorId'>): Promise<VendorPayment> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot record a vendor payment`);
      }
      const vendor = await requireVendor(tx, vendorId);
      if (ctx.role === 'SITE_MANAGER') {
        if (!vendor.siteId || !ctx.siteIds.includes(vendor.siteId)) forbidScope('Vendor out of scope');
      }

      if (!(input.amountPaise > 0)) {
        throw new ApiException('VALIDATION_FAILED', 'Amount must be greater than 0', { amountPaise: 'required' });
      }
      const today = businessDateNow(new Date(), await loadEodCutoff(tx));
      if (daysBetween(input.businessDate, today) < 0) {
        throw new ApiException('VALIDATION_FAILED', 'Business date cannot be in the future', { businessDate: 'future date' });
      }

      const [row] = await tx
        .insert(schema.vendorPayments)
        .values({
          id: input.id,
          orgId: p.orgId,
          vendorId,
          amountPaise: input.amountPaise,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.vendorPayments).where(eq(schema.vendorPayments.id, input.id));
        if (existing) return mapVendorPayment(existing);
        throw new ApiException('CONFLICT', 'Could not record vendor payment');
      }
      return mapVendorPayment(row);
    });
  }

  /** OWNER (any vendor) or SITE_MANAGER (his-site vendors only). */
  async ledger(p: Principal, vendorId: string): Promise<VendorLedger> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot view a vendor ledger`);
      }
      const vendor = await requireVendor(tx, vendorId);
      if (ctx.role === 'SITE_MANAGER') {
        if (!vendor.siteId || !ctx.siteIds.includes(vendor.siteId)) forbidScope('Vendor out of scope');
      }

      // Two flat queries (not N+1 — one per side, independent of vendor age/row count),
      // then group by the 'YYYY-MM' prefix of business_date in JS — same shape as the
      // dashboards/reconciliation services (this codebase never does SQL GROUP BY;
      // aggregation is always done in TS over a small already-scoped row set).
      const purchasedRows = await tx
        .select({ amountPaise: schema.expenses.amountPaise, businessDate: schema.expenses.businessDate })
        .from(schema.expenses)
        .where(
          and(
            isNull(schema.expenses.deletedAt),
            eq(schema.expenses.vendorId, vendorId),
            eq(schema.expenses.paidVia, 'VENDOR_CREDIT'),
            eq(schema.expenses.void, false),
          ),
        );
      const paidRows = await tx
        .select({ amountPaise: schema.vendorPayments.amountPaise, businessDate: schema.vendorPayments.businessDate })
        .from(schema.vendorPayments)
        .where(and(isNull(schema.vendorPayments.deletedAt), eq(schema.vendorPayments.vendorId, vendorId)));

      const months = new Map<string, { purchasedPaise: number; paidPaise: number }>();
      const bucket = (month: string) => {
        let b = months.get(month);
        if (!b) {
          b = { purchasedPaise: 0, paidPaise: 0 };
          months.set(month, b);
        }
        return b;
      };
      let purchasedPaise = 0;
      for (const r of purchasedRows) {
        purchasedPaise += r.amountPaise;
        bucket(r.businessDate.slice(0, 7)).purchasedPaise += r.amountPaise;
      }
      let paidPaise = 0;
      for (const r of paidRows) {
        paidPaise += r.amountPaise;
        bucket(r.businessDate.slice(0, 7)).paidPaise += r.amountPaise;
      }

      return {
        vendorId: vendor.id,
        name: vendor.name,
        purchasedPaise,
        paidPaise,
        balancePaise: purchasedPaise - paidPaise,
        months: [...months.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, v]) => ({ month, purchasedPaise: v.purchasedPaise, paidPaise: v.paidPaise })),
      };
    });
  }
}

async function requireVendor(tx: Tx, vendorId: string): Promise<Vendor> {
  const [row] = await tx.select().from(schema.vendors).where(and(eq(schema.vendors.id, vendorId), isNull(schema.vendors.deletedAt)));
  if (!row) throw new ApiException('NOT_FOUND', 'Vendor not found');
  return mapVendor(row);
}

function mapVendor(v: typeof schema.vendors.$inferSelect): Vendor {
  return {
    id: v.id,
    orgId: v.orgId,
    siteId: v.siteId ?? null,
    name: v.name,
    phone: v.phone ?? null,
    sells: v.sells ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    createdBy: v.createdBy ?? v.id,
    updatedBy: v.updatedBy ?? v.id,
    deletedAt: v.deletedAt ? v.deletedAt.toISOString() : null,
    version: v.version,
  };
}

function mapVendorPayment(vp: typeof schema.vendorPayments.$inferSelect): VendorPayment {
  return {
    id: vp.id,
    orgId: vp.orgId,
    vendorId: vp.vendorId,
    amountPaise: vp.amountPaise,
    businessDate: vp.businessDate,
    note: vp.note ?? null,
    createdAt: vp.createdAt.toISOString(),
    updatedAt: vp.updatedAt.toISOString(),
    createdBy: vp.createdBy ?? vp.id,
    updatedBy: vp.updatedBy ?? vp.id,
    deletedAt: vp.deletedAt ? vp.deletedAt.toISOString() : null,
    version: vp.version,
  };
}
