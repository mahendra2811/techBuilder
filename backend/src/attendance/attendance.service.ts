import { Injectable } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Attendance, MarkAttendanceInput } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class AttendanceService {
  constructor(private readonly dbs: DbService) {}

  async mark(p: Principal, input: MarkAttendanceInput): Promise<Attendance[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const results: Attendance[] = [];
      for (const row of input.rows) {
        const [upserted] = await tx
          .insert(schema.attendance)
          .values({
            id: row.id,
            orgId: p.orgId,
            siteId: input.siteId,
            crewId: input.crewId ?? null,
            personId: row.personId,
            businessDate: input.businessDate,
            status: row.status,
            otHours: row.otHours ?? 0,
            markedBy: p.userId,
            createdBy: p.userId,
            updatedBy: p.userId,
          })
          .onConflictDoUpdate({
            target: [schema.attendance.orgId, schema.attendance.personId, schema.attendance.businessDate],
            set: {
              status: row.status,
              otHours: row.otHours ?? 0,
              markedBy: p.userId,
              updatedBy: p.userId,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!upserted) throw new ApiException('CONFLICT', 'Could not save attendance');
        results.push(mapAttendance(upserted));
      }
      return results;
    });
  }

  async list(p: Principal, siteId: string, from: string, to: string): Promise<Attendance[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.siteId, siteId),
            gte(schema.attendance.businessDate, from),
            lte(schema.attendance.businessDate, to),
          ),
        );
      return rows.map(mapAttendance);
    });
  }
}

function mapAttendance(r: typeof schema.attendance.$inferSelect): Attendance {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    crewId: r.crewId ?? null,
    personId: r.personId,
    businessDate: r.businessDate,
    status: r.status,
    otHours: r.otHours,
    markedBy: r.markedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
