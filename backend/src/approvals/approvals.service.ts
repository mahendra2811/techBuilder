import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@techbuilder/contracts';
import type { ApprovalRequest, SubmitRequestInput, DecideRequestInput, ApprovalStatus } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { businessDateNow, daysBetween } from '../common/business-date';
import { loadExpenseLimits, loadOrgConfig } from '../common/org-config.util';

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
      // WP-1/WP-2 scope: SM decides requests from users at their sites; TH only vehicle-switch
      // requests from their own crew's users; Owner decides anything (org scope).
      await assertDecideScope(tx, ctx, existing.requestedBy, existing.type);

      const newStatus: ApprovalStatus = input.approve ? 'APPROVED' : 'REJECTED';
      // Client-plan v1 (T-4): rejecting an expense request must carry a reason the requester can read.
      if (!input.approve && existing.type === 'EXPENSE_ADD' && !input.comment?.trim()) {
        throw new ApiException('VALIDATION_FAILED', 'A reason is required when rejecting', { comment: 'required' });
      }
      const [updated] = await tx
        .update(schema.approvalRequests)
        .set({
          status: newStatus,
          approverUserId: p.userId,
          decidedAt: new Date(),
          comment: input.comment ?? null,
          updatedBy: p.userId,
        })
        .where(eq(schema.approvalRequests.id, id))
        .returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Approval request not found');

      // Client-plan v1: approving an EXPENSE_ADD materializes the booked expense (same tx —
      // request state and money never diverge). The decider's category choice wins.
      if (newStatus === 'APPROVED' && existing.type === 'EXPENSE_ADD') {
        await materializeExpense(tx, existing, input.categoryOverride, p.userId);
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
}

/** Requests visible to the caller: own requests + requests from users inside their scope. */
function listScopeFilter(tx: Tx, ctx: ScopeContext): SQL | undefined {
  if (ctx.role === 'OWNER') return undefined;
  const own = eq(schema.approvalRequests.requestedBy, ctx.userId) as SQL;
  if (ctx.role === 'SITE_MANAGER') {
    const siteUsers = tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), inSet(schema.users.assignedSiteId, ctx.siteIds)));
    return or(own, inArray(schema.approvalRequests.requestedBy, siteUsers)) as SQL;
  }
  if (ctx.role === 'TEAM_HEAD') {
    const crewUsers = tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(isNull(schema.users.deletedAt), inSet(schema.users.crewId, ctx.crewIds)));
    return or(own, inArray(schema.approvalRequests.requestedBy, crewUsers)) as SQL;
  }
  return own; // DRIVER / WORKER see only their own requests
}

async function assertDecideScope(tx: Tx, ctx: ScopeContext, requestedBy: string, type: string): Promise<void> {
  if (ctx.role === 'OWNER') return;
  const [requester] = await tx
    .select({
      assignedSiteId: schema.users.assignedSiteId,
      crewId: schema.users.crewId,
      personId: schema.users.personId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, requestedBy));
  if (!requester) forbidScope('Requester not found in your scope');

  if (ctx.role === 'SITE_MANAGER') {
    if (requester.assignedSiteId && ctx.siteIds.includes(requester.assignedSiteId)) return;
    // Drivers usually carry no assignedSiteId — their site comes from their vehicle assignment.
    if (requester.personId) {
      const vehicleSites = await tx
        .select({ siteId: schema.vehicles.assignedSiteId })
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, requester.personId)));
      if (vehicleSites.some((v) => v.siteId && ctx.siteIds.includes(v.siteId))) return;
    }
    forbidScope('Request is outside your site scope');
  }
  if (ctx.role === 'TEAM_HEAD') {
    // Client-plan v1: TH decides vehicle-switch AND expense requests, crew-scoped. Drivers are
    // site-level (no crewId) so their requests naturally route past the TH to the SM.
    if (type !== 'VEHICLE_SWITCH' && type !== 'EXPENSE_ADD') {
      forbidScope('Team heads may only decide vehicle-switch and expense requests');
    }
    if (requester.crewId && ctx.crewIds.includes(requester.crewId)) return;
    forbidScope('Request is outside your crew scope');
  }
  forbidScope(`Role ${ctx.role} cannot decide requests`);
}

// ---- EXPENSE_ADD (client-plan v1): payload validation · materialization · notifications ----

const ExpenseAddPayloadSchema = z.object({
  siteId: z.string().uuid().optional(), // derived server-side for workers/drivers
  category: z.enum(EXPENSE_CATEGORIES),
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
        'Amount is over your request limit — ask your Team Head / Site Manager',
        { amountPaise: 'OVER_REQUEST_CAP' },
      );
    }
  }
  return { ...pl, siteId };
}

/** APPROVED EXPENSE_ADD → booked `expenses` row. expense.id = request.id (1:1, idempotent,
 *  traceable); enteredBy = the requester (the spender — the ledger debits HIS khata). */
async function materializeExpense(
  tx: Tx,
  req: typeof schema.approvalRequests.$inferSelect,
  categoryOverride: DecideRequestInput['categoryOverride'],
  deciderId: string,
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
    })
    .onConflictDoNothing();
}

/** Best-effort submit notifications: the site's SM + (for workers) the crew's TH. */
async function notifyExpenseRequested(
  tx: Tx,
  orgId: string,
  ctx: ScopeContext,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const siteId = typeof payload.siteId === 'string' ? payload.siteId : null;
  const targets = new Set<string>();
  if (siteId) {
    const [site] = await tx
      .select({ sm: schema.sites.siteManagerId })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), isNull(schema.sites.deletedAt)));
    if (site?.sm && site.sm !== ctx.userId) targets.add(site.sm);
  }
  if (ctx.role === 'WORKER') {
    const [u] = await tx.select({ crewId: schema.users.crewId }).from(schema.users).where(eq(schema.users.id, ctx.userId));
    if (u?.crewId) {
      const [crew] = await tx
        .select({ th: schema.crews.teamHeadUserId })
        .from(schema.crews)
        .where(and(eq(schema.crews.id, u.crewId), isNull(schema.crews.deletedAt)));
      if (crew?.th && crew.th !== ctx.userId) targets.add(crew.th);
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
  };
}
