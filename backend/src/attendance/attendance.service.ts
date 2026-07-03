import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Attendance, MarkAttendanceInput } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { assertPersonInScope, assertSiteInScope, forbidScope, loadScope, personReadFilter } from '../common/scope.util';
import { ATTENDANCE_BACKDATE_LIMIT_DAYS, assertBackdateWindow } from '../common/backdate.util';

@Injectable()
export class AttendanceService {
  constructor(private readonly dbs: DbService) {}

  async mark(p: Principal, input: MarkAttendanceInput): Promise<Attendance[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);

      // WP-1 scope: the site must be in scope; crew-scoped markers (TH) are additionally
      // bound to their own crew's persons. SM scope is the site itself (persons at the site
      // may legitimately be outside any crew), so the site assert suffices for SM.
      assertSiteInScope(ctx, 'attendance.mark', input.siteId);
      if (ctx.role === 'TEAM_HEAD') {
        for (const row of input.rows) assertPersonInScope(ctx, 'attendance.mark', row.personId);
      }

      // WP-4 backdating window (business date per org EOD cutoff, Asia/Kolkata).
      await assertBackdateWindow(tx, ctx.role, input.businessDate, ATTENDANCE_BACKDATE_LIMIT_DAYS);

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
              version: sql`${schema.attendance.version} + 1`, // corrections bump version → export "corrected" flag
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
      const ctx = await loadScope(tx, p);
      // Site-scoped roles must stay inside their site; crew/self-scoped roles additionally
      // only see their crew's / their own person rows (SM sees the whole site).
      if (ctx.role === 'SITE_MANAGER' || ctx.role === 'TEAM_HEAD') {
        if (!ctx.siteIds.includes(siteId)) forbidScope('Site out of scope');
      }
      const personFilter =
        ctx.role === 'OWNER' || ctx.role === 'SITE_MANAGER'
          ? undefined
          : personReadFilter(ctx, 'view.all', schema.attendance.personId);
      const rows = await tx
        .select()
        .from(schema.attendance)
        .where(
          and(
            isNull(schema.attendance.deletedAt),
            eq(schema.attendance.siteId, siteId),
            personFilter,
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
