import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { ApprovalRequest, SubmitRequestInput, DecideRequestInput, ApprovalStatus } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

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
      const [existing] = await tx
        .select()
        .from(schema.approvalRequests)
        .where(eq(schema.approvalRequests.id, id));
      if (!existing) throw new ApiException('NOT_FOUND', 'Approval request not found');

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
      const statusFilter = status ? eq(schema.approvalRequests.status, status) : undefined;
      const rows = await tx
        .select()
        .from(schema.approvalRequests)
        .where(and(statusFilter))
        .orderBy(desc(schema.approvalRequests.createdAt));
      return rows.map(mapApprovalRequest);
    });
  }
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
