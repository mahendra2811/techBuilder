import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { ApprovalRequest, SubmitRequestInput, DecideRequestInput, ApprovalStatus } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';

@Injectable()
export class ApprovalsService {
  constructor(private readonly dbs: DbService) {}

  async submitRequest(p: Principal, input: SubmitRequestInput): Promise<ApprovalRequest> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.approvalRequests)
        .values({
          id: input.id,
          orgId: p.orgId,
          type: input.type,
          payload: input.payload,
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
        if (existing) return mapApprovalRequest(existing);
        throw new ApiException('CONFLICT', 'Could not create approval request');
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
    .select({ assignedSiteId: schema.users.assignedSiteId, crewId: schema.users.crewId })
    .from(schema.users)
    .where(eq(schema.users.id, requestedBy));
  if (!requester) forbidScope('Requester not found in your scope');

  if (ctx.role === 'SITE_MANAGER') {
    if (requester.assignedSiteId && ctx.siteIds.includes(requester.assignedSiteId)) return;
    forbidScope('Request is outside your site scope');
  }
  if (ctx.role === 'TEAM_HEAD') {
    if (type !== 'VEHICLE_SWITCH') forbidScope('Team heads may only decide vehicle-switch requests');
    if (requester.crewId && ctx.crewIds.includes(requester.crewId)) return;
    forbidScope('Request is outside your crew scope');
  }
  forbidScope(`Role ${ctx.role} cannot decide requests`);
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
