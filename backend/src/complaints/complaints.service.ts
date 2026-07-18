import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type { Complaint, ComplaintTarget, CreateComplaintInput, IssueStatus } from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';

/** CW-10 complaint box: WORKER/DRIVER/SUPERVISOR/ACCOUNTANT raise (any target their role allows);
 *  SITE_MANAGER (frozen.10, SUP-1) may ALSO raise, but only target=OWNER (an SM complaining about
 *  his own site would have nobody-but-himself to address it to). SM (his sites, SM-addressed
 *  only, PLUS his own raised rows) + OWNER (everything) may see; only OWNER/SM may resolve.
 *  target=OWNER rows raised by the 4 base raiser roles stay private to Owners — the `list` scope
 *  filter below is the ONLY place that enforces that privacy, so it must never be loosened to let
 *  a SITE_MANAGER match ANOTHER user's OWNER-target row (only his OWN, via raisedBy). */
const RAISER_ROLES = new Set(['WORKER', 'DRIVER', 'SUPERVISOR', 'ACCOUNTANT']);

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

/** Per-org running number (#101, #102…) — SELECT max+1 read fresh on every attempt. */
async function nextComplaintNo(tx: Tx): Promise<number> {
  const [r] = await tx
    .select({ maxNo: sql<string>`coalesce(max(${schema.complaints.complaintNo}), 100)` })
    .from(schema.complaints);
  return Number(r?.maxNo ?? 100) + 1;
}

/**
 * Assigns `complaintNo` server-side and inserts. The insert runs inside a SAVEPOINT
 * (`tx.transaction(...)` nested inside the tenant tx) so a rare concurrent-create race on the
 * `(org_id, complaint_no)` unique index only rolls back the savepoint — not the whole tenant
 * transaction — letting us retry once with a freshly re-read max (default READ COMMITTED
 * isolation means the retry's SELECT sees the other transaction's now-committed row). The `id`
 * PK stays idempotent-on-replay via `onConflictDoNothing`, same as every other module's create().
 */
async function insertComplaintWithNo(
  tx: Tx,
  p: Principal,
  input: CreateComplaintInput,
  siteId: string | null,
): Promise<Complaint> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const complaintNo = await nextComplaintNo(tx);
    try {
      const row = await tx.transaction(async (tx2) => {
        const [inserted] = await tx2
          .insert(schema.complaints)
          .values({
            id: input.id,
            orgId: p.orgId,
            complaintNo,
            raisedBy: p.userId,
            target: input.target,
            siteId,
            text: input.text,
            mediaIds: input.mediaIds ?? [],
            status: 'OPEN',
            createdBy: p.userId,
            updatedBy: p.userId,
          })
          .onConflictDoNothing({ target: schema.complaints.id }) // idempotent on client UUIDv7
          .returning();
        if (inserted) return inserted;
        const [existing] = await tx2.select().from(schema.complaints).where(eq(schema.complaints.id, input.id));
        return existing ?? null;
      });
      if (row) return mapComplaint(row); // fresh insert OR idempotent replay — no duplicate notifications
      throw new ApiException('CONFLICT', 'Could not create complaint');
    } catch (err) {
      if (attempt === 0 && isUniqueViolation(err)) continue; // complaint_no race — retry with a fresh max
      throw err;
    }
  }
  throw new ApiException('CONFLICT', 'Could not create complaint');
}

@Injectable()
export class ComplaintsService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateComplaintInput): Promise<Complaint> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const isSm = ctx.role === 'SITE_MANAGER';
      if (!RAISER_ROLES.has(ctx.role) && !isSm) forbidScope(`Role ${ctx.role} cannot raise a complaint`);
      if (isSm && input.target !== 'OWNER') {
        throw new ApiException('VALIDATION_FAILED', 'A Site Manager complaint must be addressed to the Owner', {
          target: 'must be OWNER',
        });
      }
      // siteId derived server-side from the raiser's own scope (client never supplies it).
      const siteId = ctx.siteIds[0] ?? null;

      const complaint = await insertComplaintWithNo(tx, p, input, siteId);
      await notifyComplaintRaised(tx, p.orgId, ctx, complaint.id, input.target, siteId);
      return complaint;
    });
  }

  async list(
    p: Principal,
    opts: { status?: IssueStatus; limit?: string; offset?: string; no?: string } = {},
  ): Promise<Complaint[]> {
    const limit = Math.min(Math.max(parseInt(opts.limit ?? '', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(opts.offset ?? '', 10) || 0, 0);
    const parsedNo = opts.no !== undefined ? parseInt(opts.no, 10) : undefined;
    const no = parsedNo !== undefined && !Number.isNaN(parsedNo) ? parsedNo : undefined;

    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const statusFilter = opts.status ? eq(schema.complaints.status, opts.status) : undefined;
      const noFilter = no !== undefined ? eq(schema.complaints.complaintNo, no) : undefined;

      // Scope: OWNER sees every complaint (SM-addressed AND Owner-private). SITE_MANAGER sees
      // SM-addressed complaints on his own sites PLUS whatever he himself raised (frozen.10,
      // SUP-1 — his own to-Owner complaints included, via raisedBy) — an OWNER-target row raised
      // by someone ELSE never matches this filter, which is what keeps it private. Everyone else
      // (the 4 base raiser roles) sees only what they themselves raised.
      const scopeFilter =
        ctx.role === 'OWNER'
          ? undefined
          : ctx.role === 'SITE_MANAGER'
            ? or(
                and(eq(schema.complaints.target, 'SITE_MANAGER'), inSet(schema.complaints.siteId, ctx.siteIds)),
                eq(schema.complaints.raisedBy, p.userId),
              )
            : eq(schema.complaints.raisedBy, p.userId);

      const rows = await tx
        .select()
        .from(schema.complaints)
        .where(and(isNull(schema.complaints.deletedAt), statusFilter, scopeFilter, noFilter))
        .orderBy(desc(schema.complaints.createdAt))
        .limit(limit)
        .offset(offset);
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
    complaintNo: c.complaintNo,
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
