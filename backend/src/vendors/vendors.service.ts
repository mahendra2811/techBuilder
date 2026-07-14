import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateVendorInput,
  CreateVendorPaymentInput,
  Vendor,
  VendorLedger,
  VendorPayment,
  VerifyInput,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';
import { assertCanVerify, assertNotVerified, notifyMoneyFlagged, verificationSet } from '../common/verification.util';
import { computeVendorLedger } from './vendor-ledger';

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

  /** OWNER (any vendor) or SITE_MANAGER/ACCOUNTANT (vendor's site must be one of his — org-wide
   *  vendors, siteId null, are Owner-only for payments). `kind` defaults to PAYMENT (site pays the
   *  vendor); RECEIPT is Round-2 vendor money-IN (the vendor hands the site money). Round 2
   *  two-tick: the accountant recording his own move IS the verification (mirrors
   *  cash-transfers.service.ts create()) — everyone else's entry waits for the accountant's tick. */
  async createPayment(p: Principal, vendorId: string, input: Omit<CreateVendorPaymentInput, 'vendorId'>): Promise<VendorPayment> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
        forbidScope(`Role ${ctx.role} cannot record a vendor payment`);
      }
      const vendor = await requireVendor(tx, vendorId);
      if (ctx.role === 'SITE_MANAGER' || ctx.role === 'ACCOUNTANT') {
        if (!vendor.siteId || !ctx.siteIds.includes(vendor.siteId)) forbidScope('Vendor out of scope');
      }

      if (!(input.amountPaise > 0)) {
        throw new ApiException('VALIDATION_FAILED', 'Amount must be greater than 0', { amountPaise: 'required' });
      }
      const today = businessDateNow(new Date(), await loadEodCutoff(tx));
      if (daysBetween(input.businessDate, today) < 0) {
        throw new ApiException('VALIDATION_FAILED', 'Business date cannot be in the future', { businessDate: 'future date' });
      }

      const kind = input.kind ?? 'PAYMENT';
      const verifyStamp = ctx.role === 'ACCOUNTANT' ? { verifiedBy: p.userId, verifiedAt: new Date() } : {};

      const [row] = await tx
        .insert(schema.vendorPayments)
        .values({
          id: input.id,
          orgId: p.orgId,
          vendorId,
          kind,
          amountPaise: input.amountPaise,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
          ...verifyStamp,
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

  /**
   * Round 2 two-tick: the accountant's verdict on a vendor payment/receipt. Scope: the site's
   * accountant (vendor.siteId) or the Owner; a vendor with siteId null (org-wide) is Owner-only.
   * ok=false → 🚩 flagged + MONEY_FLAGGED to the site SM + Owners.
   */
  async verifyPayment(p: Principal, id: string, input: VerifyInput): Promise<VendorPayment> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [row] = await tx.select().from(schema.vendorPayments).where(eq(schema.vendorPayments.id, id));
      assertNotVerified(row, 'Vendor payment');
      const vp = row!;
      const [vendorRow] = await tx
        .select({ siteId: schema.vendors.siteId })
        .from(schema.vendors)
        .where(eq(schema.vendors.id, vp.vendorId));
      const siteId = vendorRow?.siteId ?? null;
      assertCanVerify(ctx, siteId);

      const set = verificationSet(ctx, input);
      const [updated] = await tx.update(schema.vendorPayments).set(set).where(eq(schema.vendorPayments.id, id)).returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Vendor payment not found');

      if (!input.ok) {
        await notifyMoneyFlagged(tx, vp.orgId, siteId, {
          kind: 'vendor-payment',
          paymentId: vp.id,
          vendorId: vp.vendorId,
          paymentKind: vp.kind,
          flagNote: input.flagNote,
          amountPaise: vp.amountPaise,
        });
      }
      return mapVendorPayment(updated);
    });
  }

  /** OWNER (any vendor) or SITE_MANAGER/ACCOUNTANT (his-site vendors only — the accountant now
   *  creates payments/receipts on his sites, CW-6, so he needs the same ledger visibility). */
  async ledger(p: Principal, vendorId: string): Promise<VendorLedger> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
        forbidScope(`Role ${ctx.role} cannot view a vendor ledger`);
      }
      const vendor = await requireVendor(tx, vendorId);
      if (ctx.role === 'SITE_MANAGER' || ctx.role === 'ACCOUNTANT') {
        if (!vendor.siteId || !ctx.siteIds.includes(vendor.siteId)) forbidScope('Vendor out of scope');
      }

      // Three flat queries (not N+1 — one per side, independent of vendor age/row count); the
      // grouping/aggregation itself is the pure computeVendorLedger() (unit-tested, vendor-ledger.spec.ts).
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
      // frozen.8 (Round-2 vendor money-IN, CW-6): vendor_payments carries a `kind` (PAYMENT|RECEIPT,
      // default PAYMENT) — split by kind so every pre-frozen.8 row (all default PAYMENT) keeps its
      // exact prior behavior; createPayment() now accepts `kind` so RECEIPT rows are live.
      const paidRows = await tx
        .select({ amountPaise: schema.vendorPayments.amountPaise, businessDate: schema.vendorPayments.businessDate })
        .from(schema.vendorPayments)
        .where(
          and(
            isNull(schema.vendorPayments.deletedAt),
            eq(schema.vendorPayments.vendorId, vendorId),
            eq(schema.vendorPayments.kind, 'PAYMENT'),
          ),
        );
      const receivedRows = await tx
        .select({ amountPaise: schema.vendorPayments.amountPaise, businessDate: schema.vendorPayments.businessDate })
        .from(schema.vendorPayments)
        .where(
          and(
            isNull(schema.vendorPayments.deletedAt),
            eq(schema.vendorPayments.vendorId, vendorId),
            eq(schema.vendorPayments.kind, 'RECEIPT'),
          ),
        );

      const totals = computeVendorLedger(purchasedRows, paidRows, receivedRows);
      return { vendorId: vendor.id, name: vendor.name, ...totals };
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
    // frozen.8 (Round-2 vendor money-IN, CW-6) — createPayment() accepts `kind` (default PAYMENT).
    kind: vp.kind,
    amountPaise: vp.amountPaise,
    businessDate: vp.businessDate,
    note: vp.note ?? null,
    createdAt: vp.createdAt.toISOString(),
    updatedAt: vp.updatedAt.toISOString(),
    createdBy: vp.createdBy ?? vp.id,
    updatedBy: vp.updatedBy ?? vp.id,
    deletedAt: vp.deletedAt ? vp.deletedAt.toISOString() : null,
    version: vp.version,
    // frozen.8 (Round-2 two-tick rule, CW-6) — set by createPayment() (accountant self-verify)
    // or verifyPayment() (the tick).
    verifiedBy: vp.verifiedBy ?? null,
    verifiedAt: vp.verifiedAt ? vp.verifiedAt.toISOString() : null,
    flagged: vp.flagged,
    flagNote: vp.flagNote ?? null,
  };
}
