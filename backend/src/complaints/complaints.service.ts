import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Complaint, ComplaintTarget, CreateComplaintInput, IssueStatus } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';

/** CW-10 complaint box: WORKER/DRIVER/SUPERVISOR/ACCOUNTANT raise; SM (his sites, SM-addressed
 *  only) + OWNER (everything) may see + resolve. target=OWNER rows are private to Owners — the
 *  `list` scope filter below is the ONLY place that enforces that privacy, so it must never be
 *  loosened to let a SITE_MANAGER match an OWNER-target row. */
const RAISER_ROLES = new Set(['WORKER', 'DRIVER', 'SUPERVISOR', 'ACCOUNTANT']);

@Injectable()
export class ComplaintsService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateComplaintInput): Promise<Complaint> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (!RAISER_ROLES.has(ctx.role)) forbidScope(`Role ${ctx.role} cannot raise a complaint`);
      // siteId derived server-side from the raiser's own scope (client never supplies it).
      const siteId = ctx.siteIds[0] ?? null;

      const [row] = await tx
        .insert(schema.complaints)
        .values({
          id: input.id,
          orgId: p.orgId,
          raisedBy: p.userId,
          target: input.target,
          siteId,
          text: input.text,
          mediaIds: input.mediaIds ?? [],
          status: 'OPEN',
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      let complaint = row;
      if (!complaint) {
        const [existing] = await tx.select().from(schema.complaints).where(eq(schema.complaints.id, input.id));
        if (existing) return mapComplaint(existing); // idempotent replay — no duplicate notifications
        throw new ApiException('CONFLICT', 'Could not create complaint');
      }
      await notifyComplaintRaised(tx, p.orgId, ctx, complaint.id, input.target, siteId);
      return mapComplaint(complaint);
    });
  }

  async list(p: Principal, status?: IssueStatus): Promise<Complaint[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const statusFilter = status ? eq(schema.complaints.status, status) : undefined;

      // Scope: OWNER sees every complaint (SM-addressed AND Owner-private). SITE_MANAGER sees
      // ONLY SM-addressed complaints on his own sites — an OWNER-target row never matches this
      // filter, which is what keeps it private. Everyone else (the raiser roles; SM can't raise)
      // sees only what they themselves raised.
      const scopeFilter =
        ctx.role === 'OWNER'
          ? undefined
          : ctx.role === 'SITE_MANAGER'
            ? and(eq(schema.complaints.target, 'SITE_MANAGER'), inSet(schema.complaints.siteId, ctx.siteIds))
            : eq(schema.complaints.raisedBy, p.userId);

      const rows = await tx
        .select()
        .from(schema.complaints)
        .where(and(isNull(schema.complaints.deletedAt), statusFilter, scopeFilter))
        .orderBy(desc(schema.complaints.createdAt));
      return rows.map(mapComplaint);
    });
  }

  /** An Owner may resolve any complaint; an SM only SM-addressed ones on his own sites.
   *  Just flips status → RESOLVED (no resolution-note column exists on `complaints` — inventing
   *  one is out of scope for this work order; see the CW-10 report for the decision). */
  async resolve(p: Principal, id: string): Promise<Complaint> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [existing] = await tx.select().from(schema.complaints).where(eq(schema.complaints.id, id));
      if (!existing || existing.deletedAt) throw new ApiException('NOT_FOUND', 'Complaint not found');

      if (ctx.role === 'OWNER') {
        // any complaint
      } else if (ctx.role === 'SITE_MANAGER') {
        if (existing.target !== 'SITE_MANAGER' || !existing.siteId || !ctx.siteIds.includes(existing.siteId)) {
          forbidScope('Complaint out of scope');
        }
      } else {
        forbidScope(`Role ${ctx.role} cannot resolve complaints`);
      }

      if (existing.status === 'RESOLVED') throw new ApiException('CONFLICT', 'Complaint already resolved');

      const [row] = await tx
        .update(schema.complaints)
        .set({
          status: 'RESOLVED',
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.complaints.version} + 1`,
        })
        .where(eq(schema.complaints.id, id))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Complaint not found');
      return mapComplaint(row);
    });
  }
}

/** Notify on raise: target=SITE_MANAGER → the site's SM + all active Owners;
 *  target=OWNER → all active Owners only (never the SM — that's the privacy rule). */
async function notifyComplaintRaised(
  tx: Tx,
  orgId: string,
  ctx: ScopeContext,
  complaintId: string,
  target: ComplaintTarget,
  siteId: string | null,
): Promise<void> {
  const targets = new Set<string>();
  if (target === 'SITE_MANAGER' && siteId) {
    const [site] = await tx
      .select({ sm: schema.sites.siteManagerId })
      .from(schema.sites)
      .where(and(eq(schema.sites.id, siteId), isNull(schema.sites.deletedAt)));
    if (site?.sm && site.sm !== ctx.userId) targets.add(site.sm);
  }
  const owners = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(isNull(schema.users.deletedAt), eq(schema.users.role, 'OWNER'), eq(schema.users.active, true)));
  owners.forEach((o) => o.id !== ctx.userId && targets.add(o.id));

  if (!targets.size) return;
  await tx.insert(schema.notifications).values(
    [...targets].map((userId) => ({
      id: uuidv7(),
      orgId,
      userId,
      type: 'COMPLAINT_RAISED' as const,
      payload: { complaintId, target },
    })),
  );
}

function mapComplaint(c: typeof schema.complaints.$inferSelect): Complaint {
  return {
    id: c.id,
    orgId: c.orgId,
    raisedBy: c.raisedBy,
    target: c.target,
    siteId: c.siteId ?? null,
    text: c.text,
    mediaIds: (c.mediaIds as string[] | null) ?? [],
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    createdBy: c.createdBy ?? c.id,
    updatedBy: c.updatedBy ?? c.id,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    version: c.version,
  };
}
