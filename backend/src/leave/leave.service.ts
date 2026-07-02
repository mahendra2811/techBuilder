import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateLeaveInput, Leave } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { assertPersonInScope, loadScope } from '../common/scope.util';

@Injectable()
export class LeaveService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateLeaveInput): Promise<Leave> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      // WP-1: leave is set FOR a person — that person must be inside the setter's scope
      // (TH: own crew; SM: persons in crews at their sites; Owner: anyone).
      assertPersonInScope(ctx, 'attendance.mark', input.personId);
      const [row] = await tx
        .insert(schema.leaves)
        .values({
          id: input.id,
          orgId: p.orgId,
          personId: input.personId,
          startDate: input.startDate,
          endDate: input.endDate,
          type: input.type,
          reason: input.reason ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.leaves).where(eq(schema.leaves.id, input.id));
        if (existing) return mapLeave(existing);
        throw new ApiException('CONFLICT', 'Could not create leave');
      }
      return mapLeave(row);
    });
  }
}

function mapLeave(r: typeof schema.leaves.$inferSelect): Leave {
  return {
    id: r.id,
    orgId: r.orgId,
    personId: r.personId,
    startDate: r.startDate,
    endDate: r.endDate,
    type: r.type,
    reason: r.reason ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
