import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@techbuilder/contracts';
import type { ApprovalRequest, SubmitRequestInput, DecideRequestInput, ApprovalStatus, VerifyInput } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadExpenseLimits, loadOrgConfig } from '../common/org-config.util';
import { assertCanVerify, assertNotVerified, notifyMoneyFlagged, verificationSet } from '../common/verification.util';

@Injectable()
export class ApprovalsService {
  constructor(private readonly dbs: DbService) {}

  async submitRequest(p: Principal, input: SubmitRequestInput): Promise<ApprovalRequest> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      // Client-plan v1: workers hold request.submit for EXPENSE_ADD only.
      if (ctx.role === 'WORKER' && input.type !== 'EXPENSE_ADD') {
        forbidScope('Workers may only submit expense requests');
      }
      // Non-EXPENSE_ADD types are phase-parked and shape-unvalidated — at least cap the blob
      // so nobody can stuff arbitrary megabytes into the payload jsonb column.
      if (input.type !== 'EXPENSE_ADD' && JSON.stringify(input.payload).length > 4_000) {
        throw new ApiException('VALIDATION_FAILED', 'Request payload too large', { payload: 'too large' });
      }
      const payload =
        input.type === 'EXPENSE_ADD' ? await validateExpenseAddPayload(tx, ctx, input.payload) : input.payload;
      const [row] = await tx
        .insert(schema.approvalRequests)
        .values({
          id: input.id,
          orgId: p.orgId,
          type: input.type,
          payload,
          status: 'PENDING',
          requestedBy: p.userId,
          approverUserId: null,
          decidedAt: null,
          comment: null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.approvalRequests)
          .where(eq(schema.approvalRequests.id, input.id));
        if (existing) return mapApprovalRequest(existing); // idempotent replay — no duplicate notifications
        throw new ApiException('CONFLICT', 'Could not create approval request');
      }
      if (input.type === 'EXPENSE_ADD') {
        await notifyExpenseRequested(tx, p.orgId, ctx, row.id, payload);
      }
      return mapApprovalRequest(row);
    });
  }

  async decideRequest(p: Principal, id: string, input: DecideRequestInput): Promise<ApprovalRequest> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id));
      if (!existing) throw new ApiException('NOT_FOUND', 'Approval request not found');

      // Approvals are REJECT-on-conflict (frozen convention) — a decided request stays decided.
      if (existing.status !== 'PENDING') {
        throw new ApiException('CONFLICT', 'Request has already been decided');
      }
      // WP-2: nobody decides their own request — not even the Owner.
      if (existing.requestedBy === p.userId) {
        forbidScope('You cannot decide your own request');
      }
      // Round 2 decider map: Owner anything · ACCOUNTANT money (own sites) · SM site (approval
      // still awaits the accountant's tick) · SUPERVISOR nothing.
      await assertDecideScope(tx, ctx, existing.requestedBy, existing.type);

      const newStatus: ApprovalStatus = input.approve ? 'APPROVED' : 'REJECTED';
      // Client-plan v1 (T-4): rejecting an expense request must carry a reason the requester can read.
      if (!input.approve && existing.type === 'EXPENSE_ADD' && !input.comment?.trim()) {
        throw new ApiException('VALIDATION_FAILED', 'A reason is required when rejecting', { comment: 'required' });
      }
      // Round 2 two-tick: when the ACCOUNTANT (or the Owner, as override) approves, the approval
      // and the verify tick land in one act — recorded distinctly. An SM approval stays unverified.
      const decidesAndVerifies =
        input.approve && existing.type === 'EXPENSE_ADD' && (ctx.role === 'ACCOUNTANT' || ctx.role === 'OWNER');
      const verifyStamp = decidesAndVerifies ? { verifiedBy: p.userId, verifiedAt: new Date() } : {};
      const [updated] = await tx
        .update(schema.approvalRequests)
        .set({
          status: newStatus,
          approverUserId: p.userId,
          decidedAt: new Date(),
          comment: input.comment ?? null,
          updatedBy: p.userId,
          ...verifyStamp,
        })
        .where(eq(schema.approvalRequests.id, id))
        .returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Approval request not found');

      // Client-plan v1: approving an EXPENSE_ADD materializes the booked expense (same tx —
      // request state and money never diverge). The decider's category choice wins.
      if (newStatus === 'APPROVED' && existing.type === 'EXPENSE_ADD') {
        await materializeExpense(tx, existing, input.categoryOverride, p.userId, verifyStamp);
      }
      // Tell the requester what happened (dashboard "my requests" + notifications list).
      await tx.insert(schema.notifications).values({
        id: uuidv7(),
        orgId: existing.orgId,
        userId: existing.requestedBy,
        type: 'APPROVAL_DECIDED',
        payload: { requestId: existing.id, type: existing.type, approved: input.approve, comment: input.comment ?? null },
      });
      return mapApprovalRequest(updated);
    });
  }

  async listRequests(p: Principal, status?: ApprovalStatus): Promise<ApprovalRequest[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const statusFilter = status ? eq(schema.approvalRequests.status, status) : undefined;
      const rows = await tx
        .select()
        .from(schema.approvalRequests)
        .where(and(statusFilter, listScopeFilter(tx, ctx)))
        .orderBy(desc(schema.approvalRequests.createdAt));
      return rows.map(mapApprovalRequest);
    });
  }

  /**
   * Round 2 two-tick: the accountant's verdict on an APPROVED money request. ok=true stamps the
   * verify tick on the request AND its materialized expense (same tx) — both become permanent.
   * ok=false red-flags both (🚩 MONEY_FLAGGED → site SM + Owners; the Owner resolves).
   */
  async verifyRequest(p: Principal, id: string, input: VerifyInput): Promise<ApprovalRequest> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id));
      assertNotVerified(existing, 'Approval request');
      const req = existing!;
      if (req.type !== 'EXPENSE_ADD') {
        throw new ApiException('VALIDATION_FAILED', 'Only money requests carry the verify tick');
      }
      if (req.status !== 'APPROVED') {
        throw new ApiException('CONFLICT', 'Only an approved request can be verified — nothing moved yet');
      }
      const siteId = typeof (req.payload as Record<string, unknown>).siteId === 'string'
        ? ((req.payload as Record<string, unknown>).siteId as string)
        : null;
      assertCanVerify(ctx, siteId);

      const set = verificationSet(ctx, input);
      const [updated] = await tx
        .update(schema.approvalRequests)
        .set(set)
        .where(eq(schema.approvalRequests.id, id))
        .returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Approval request not found');
      // Mirror the verdict onto the booked expense (expense.id = request.id).
      await tx.update(schema.expenses).set(set).where(eq(schema.expenses.id, id));

      if (!input.ok) {
        await notifyMoneyFlagged(tx, req.orgId, siteId, {
          kind: 'request',
          requestId: req.id,
          flagNote: input.flagNote,
          requestedBy: req.requestedBy,
        });
      }
      return mapApprovalRequest(updated);
    });
  }
}

/** Requests visible to the caller: own requests + requests from users inside their scope. */
function listScopeFilter(tx: Tx, ctx: ScopeContext): SQL | undefined {
  if (ctx.role === 'OWNER') return undefined;
  const own = eq(schema.approvalRequests.requestedBy, ctx.userId) as SQL;
  if (ctx.role === 'ACCOUNTANT') {
    // Round 2: the money desk sees his sites' EXPENSE_ADD requests (payload.siteId is
    // server-derived at submit) — his own requests too, though he can never self-decide.
    return or(
      own,
      and(
        eq(schema.approvalRequests.type, 'EXPENSE_ADD'),
        inArray(sql`(${schema.approvalRequests.payload} ->> 'siteId')`, ctx.siteIds.length ? ctx.siteIds : ['-']),
      ),
    ) as SQL;
  }
  if (ctx.role === 'SITE_MANAGER') {
    const siteUsers = tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), inSet(schema.users.assignedSiteId, ctx.siteIds)));
    return or(own, inArray(schema.approvalRequests.requestedBy, siteUsers)) as SQL;
  }
  if (ctx.role === 'SUPERVISOR') {
    const crewUsers = tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), inSet(schema.users.crewId, ctx.crewIds)));
    // frozen.10 (SUP-6): money requests never reach the supervisor — his inbox is his own
    // requests + his crew's VEHICLE_SWITCH ones only.
    return or(
      own,
      and(
        inArray(schema.approvalRequests.requestedBy, crewUsers),
        eq(schema.approvalRequests.type, 'VEHICLE_SWITCH'),
      ),
    ) as SQL;
  }
  return own; // DRIVER / WORKER see only their own requests
}

/**
 * frozen.10 decider map (replaces Round 2's). OWNER: anything (override). SUPERVISOR: his
 * crew's VEHICLE_SWITCH requests ONLY. ACCOUNTANT: money (EXPENSE_ADD) only, site scope —
 * THE money desk. SITE_MANAGER: non-money types only, site scope — fully out of the money
 * loop (client decision 2026-07-18: "every money request goes through the accountant").
 */
async function assertDecideScope(tx: Tx, ctx: ScopeContext, requestedBy: string, type: string): Promise<void> {
  if (ctx.role === 'OWNER') return;
  if (ctx.role === 'SUPERVISOR') {
    if (type !== 'VEHICLE_SWITCH') forbidScope('Supervisors decide vehicle-change requests only');
    const [requester] = await tx
      .select({ crewId: schema.users.crewId })
      .from(schema.users)
      .where(and(eq(schema.users.id, requestedBy), isNull(schema.users.deletedAt)));
    if (!requester?.crewId || !ctx.crewIds.includes(requester.crewId)) {
      forbidScope('Request is outside your crew');
    }
    return;
  }
  if (ctx.role === 'ACCOUNTANT' && type !== 'EXPENSE_ADD') {
    forbidScope('The accountant decides money requests only');
  }
  if (ctx.role === 'SITE_MANAGER' && type === 'EXPENSE_ADD') {
    forbidScope('Money requests are decided by the accountant (or the Owner)');
  }
  if (ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
    forbidScope(`Role ${ctx.role} cannot decide requests`);
  }
  // SM / ACCOUNTANT: the requester must belong to one of the caller's sites.
  const requesterSites = await requesterSiteIds(tx, requestedBy);
  if (!requesterSites.some((s) => ctx.siteIds.includes(s))) {
    forbidScope('Request is outside your site scope');
  }
}

/** The sites a requester belongs to: assignedSiteId, or (drivers) their vehicles' sites. */
async function requesterSiteIds(tx: Tx, userId: string): Promise<string[]> {
  const [requester] = await tx
    .select({
      assignedSiteId: schema.users.assignedSiteId,
      personId: schema.users.personId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!requester) forbidScope('Requester not found in your scope');
  const sites: string[] = requester.assignedSiteId ? [requester.assignedSiteId] : [];
  if (requester.personId) {
    const vehicleSites = await tx
      .select({ siteId: schema.vehicles.assignedSiteId })
      .from(schema.vehicles)
      .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, requester.personId)));
    vehicleSites.forEach((v) => v.siteId && sites.push(v.siteId));
  }
  return [...new Set(sites)];
}

// ---- EXPENSE_ADD (client-plan v1): payload validation · materialization · notifications ----

const ExpenseAddPayloadSchema = z.object({
  siteId: z.string().uuid().optional(), // derived server-side for workers/drivers
  category: z.enum(EXPENSE_CATEGORIES),
  subcategory: z.string().max(40).optional(), // frozen.10 (SM-2): carried through to the booked expense
  amountPaise: z.number().int().positive(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidVia: z.enum(PAYMENT_MODES).default('CASH'),
  vendorId: z.string().uuid().optional(),
  billNo: z.string().max(120).optional(),
  remark: z.string().max(2000).optional(),
  mediaIds: z.array(z.string().uuid()).max(6).optional(),
});

/** Validate + normalize an EXPENSE_ADD payload at submit time (site derivation, caps, windows). */
async function validateExpenseAddPayload(
  tx: Tx,
  ctx: ScopeContext,
  raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = ExpenseAddPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'Invalid expense request',
      Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || 'payload', i.message])),
    );
  }
  const pl = parsed.data;

  // Site: field roles never pick it; TH/SM must stay inside their scope.
  let siteId: string;
  if (ctx.role === 'WORKER' || ctx.role === 'DRIVER') {
    const derived = ctx.siteIds[0];
    if (!derived) forbidScope('No site assigned — ask your Site Manager');
    siteId = derived;
  } else {
    const chosen = pl.siteId ?? ctx.siteIds[0];
    if (!chosen) throw new ApiException('VALIDATION_FAILED', 'siteId is required', { siteId: 'required' });
    if (ctx.role !== 'OWNER' && !ctx.siteIds.includes(chosen)) forbidScope('Site is outside your scope');
    siteId = chosen;
  }

  // Dates: future never allowed; workers/drivers bounded by the request window (today + N back).
  const cfg = await loadOrgConfig(tx); // once — feeds both the cutoff and the limits
  const today = businessDateNow(new Date(), cfg.completion.cutoffLocalTime);
  const back = daysBetween(pl.businessDate, today);
  if (back < 0) {
    throw new ApiException('VALIDATION_FAILED', 'Business date cannot be in the future', {
      businessDate: 'future date',
    });
  }
  const limits = await loadExpenseLimits(tx, siteId, cfg);
  if (ctx.role === 'WORKER' || ctx.role === 'DRIVER') {
    if (back > limits.requestBackdateDays) {
      forbidScope(`Backdating window exceeded: up to ${limits.requestBackdateDays} day(s) back`);
    }
    if (pl.amountPaise > limits.requestCapPaise) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Amount is over your request limit — ask your Supervisor / Site Manager',
        { amountPaise: 'OVER_REQUEST_CAP' },
      );
    }
  }
  return { ...pl, siteId };
}

/** APPROVED EXPENSE_ADD → booked `expenses` row. expense.id = request.id (1:1, idempotent,
 *  traceable); enteredBy = the requester (the spender — the ledger debits HIS khata).
 *  Round 2: carries the decider's verify stamp when the accountant/Owner decided (two-tick). */
async function materializeExpense(
  tx: Tx,
  req: typeof schema.approvalRequests.$inferSelect,
  categoryOverride: DecideRequestInput['categoryOverride'],
  deciderId: string,
  verifyStamp: { verifiedBy?: string; verifiedAt?: Date } = {},
): Promise<void> {
  const parsed = ExpenseAddPayloadSchema.extend({ siteId: z.string().uuid() }).safeParse(req.payload);
  if (!parsed.success) {
    throw new ApiException('VALIDATION_FAILED', 'Request payload is not a valid expense — cannot approve');
  }
  const pl = parsed.data;
  await tx
    .insert(schema.expenses)
    .values({
      id: req.id,
      orgId: req.orgId,
      siteId: pl.siteId,
      category: categoryOverride ?? pl.category,
      subcategory: pl.subcategory ?? null, // frozen.10 (SM-2)
      amountPaise: pl.amountPaise,
      vendorId: pl.vendorId ?? null,
      billNo: pl.billNo ?? null,
      receiptMediaId: pl.mediaIds?.[0] ?? null,
      paidVia: pl.paidVia,
      remark: pl.remark ?? null,
      businessDate: pl.businessDate,
      enteredBy: req.requestedBy,
      void: false,
      createdBy: deciderId,
      updatedBy: deciderId,
      ...verifyStamp,
    })
    .onConflictDoNothing();
}

/** Round 2 submit notifications: the site's ACCOUNTANT (routine decider) + the site's SM
 *  (visibility) + the requester's crew SUPERVISOR (visibility). No accountant on the site →
 *  every Owner is told instead (the Owner can always decide). */
async function notifyExpenseRequested(
  tx: Tx,
  orgId: string,
  ctx: ScopeContext,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const siteId = typeof payload.siteId === 'string' ? payload.siteId : null;
  const targets = new Set<string>();
  let accountant: string | null = null;
  if (siteId) {
    const [site] = await tx
      .select({ sm: schema.sites.siteManagerId, acc: schema.sites.accountantId })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), isNull(schema.sites.deletedAt)));
    if (site?.sm && site.sm !== ctx.userId) targets.add(site.sm);
    if (site?.acc && site.acc !== ctx.userId) {
      accountant = site.acc;
      targets.add(site.acc);
    }
  }
  if (!accountant) {
    const owners = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), eq(schema.users.role, 'OWNER'), eq(schema.users.active, true)));
    owners.forEach((o) => o.id !== ctx.userId && targets.add(o.id));
  }
  if (ctx.role === 'WORKER' || ctx.role === 'DRIVER') {
    const [u] = await tx.select({ crewId: schema.users.crewId }).from(schema.users).where(eq(schema.users.id, ctx.userId));
    if (u?.crewId) {
      const [crew] = await tx
        .select({ sup: schema.crews.supervisorUserId })
        .from(schema.crews)
        .where(and(eq(schema.crews.id, u.crewId), isNull(schema.crews.deletedAt)));
      if (crew?.sup && crew.sup !== ctx.userId) targets.add(crew.sup);
    }
  }
  if (!targets.size) return;
  await tx.insert(schema.notifications).values(
    [...targets].map((userId) => ({
      id: uuidv7(),
      orgId,
      userId,
      type: 'APPROVAL_REQUESTED' as const,
      payload: { requestId, type: 'EXPENSE_ADD' },
    })),
  );
}

function mapApprovalRequest(r: typeof schema.approvalRequests.$inferSelect): ApprovalRequest {
  return {
    id: r.id,
    orgId: r.orgId,
    type: r.type,
    payload: r.payload as Record<string, unknown>,
    status: r.status,
    requestedBy: r.requestedBy,
    approverUserId: r.approverUserId ?? null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    comment: r.comment ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
    // Round-2 two-tick rule: the accountant's verify tick (verifyRequest / decide-by-accountant).
    verifiedBy: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    flagged: r.flagged,
    flagNote: r.flagNote ?? null,
  };
}
