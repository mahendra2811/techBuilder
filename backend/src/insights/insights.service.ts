import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  ApprovalRequest,
  DayInsights,
  Expense,
  ExpenseCategory,
  PeriodTotals,
  PersonInsights,
  ProgressNote,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope, type ScopeContext } from '../common/scope.util';
import { addDays, kolkataClock } from '../common/business-date';

/**
 * WO-13 — date-wise "pick a day, see everything" insights (client plan S-1/T-1/O-1).
 * All three endpoints are read-only rollups over progress notes + non-void expenses +
 * approval requests, fetched ONCE per call and grouped/bucketed in TS (dashboards.service
 * convention — no per-day queries).
 *
 * DAY-BUCKETING RULE for requests (approvalRequests has no businessDate column):
 *   - EXPENSE_ADD: bucket = payload.businessDate (always present — validateExpenseAddPayload
 *     stamps it at submit time), so a backdated expense request appears on the day it is FOR.
 *   - every other type (VEHICLE_SWITCH / LEAVE / MATERIAL): bucket = the Kolkata calendar date
 *     of createdAt (no reliable "for this date" field on those payloads — keep it simple).
 * Requests are fetched by a padded createdAt window (from -10d .. to +1d, covers the widest
 * configured backdate window with room to spare) and then bucketed + strictly re-filtered to
 * [from, to] in TS — avoids a second per-day round trip while staying correct for backdated
 * EXPENSE_ADD requests whose bucket date can precede their createdAt date.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateParam(v: string | undefined, field: string): asserts v is string {
  if (!v || !DATE_RE.test(v)) {
    throw new ApiException('VALIDATION_FAILED', `${field} must be a YYYY-MM-DD date`, { [field]: 'invalid' });
  }
}

function assertSiteIdParam(v: string | undefined): asserts v is string {
  if (!v) throw new ApiException('VALIDATION_FAILED', 'siteId is required', { siteId: 'required' });
}

/** Round 2 (CW-9) lockdown: insights/analytics are a SITE_MANAGER + OWNER-only surface.
 *  SUPERVISOR (was TEAM_HEAD), ACCOUNTANT, DRIVER, WORKER get nothing aggregated — no
 *  exceptions, regardless of site/crew scope. */
function assertInsightsRole(ctx: ScopeContext): void {
  if (ctx.role !== 'SITE_MANAGER' && ctx.role !== 'OWNER') {
    forbidScope('Insights are only available to Site Managers and the Owner');
  }
}

/** Day/period insights are requested for ONE site; OWNER = any, SM = their own site(s)
 *  (unreachable by any other role — assertInsightsRole gates entry first). */
function assertSiteAccessible(ctx: ScopeContext, siteId: string): void {
  if (ctx.role === 'OWNER') return;
  if (ctx.siteIds.includes(siteId)) return;
  forbidScope('Site is outside your scope');
}

@Injectable()
export class InsightsService {
  constructor(private readonly dbs: DbService) {}

  async getDayInsights(p: Principal, siteId: string | undefined, date: string | undefined): Promise<DayInsights> {
    assertSiteIdParam(siteId);
    assertDateParam(date, 'date');
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertInsightsRole(ctx);
      assertSiteAccessible(ctx, siteId);
      const rows = await fetchSiteRows(tx, siteId, date, date);
      return buildDayInsights(date, rows.progress, rows.expenses, rows.requests);
    });
  }

  async getPeriodInsights(
    p: Principal,
    siteId: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): Promise<{ totals: PeriodTotals; days: DayInsights[] }> {
    assertSiteIdParam(siteId);
    assertDateParam(from, 'from');
    assertDateParam(to, 'to');
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertInsightsRole(ctx);
      assertSiteAccessible(ctx, siteId);
      const rows = await fetchSiteRows(tx, siteId, from, to);
      return buildPeriod(from, to, rows.progress, rows.expenses, rows.requests);
    });
  }

  async getPersonInsights(
    p: Principal,
    userId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<PersonInsights> {
    assertDateParam(from, 'from');
    assertDateParam(to, 'to');
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      assertInsightsRole(ctx);
      const target = await loadTargetUser(tx, userId);
      await assertPersonAccessible(tx, ctx, target);
      const rows = await fetchPersonRows(tx, target.id, from, to);
      const { totals, days } = buildPeriod(from, to, rows.progress, rows.expenses, rows.requests);
      return { userId: target.id, personId: target.personId, name: target.name, days, totals };
    });
  }
}

// ---------------------------------------------------------------------------
// Scope: which rows may this caller see for this site/person?
// ---------------------------------------------------------------------------

interface TargetUser {
  id: string;
  name: string;
  personId: string | null;
  assignedSiteId: string | null;
  crewId: string | null;
}

async function loadTargetUser(tx: Tx, userId: string): Promise<TargetUser> {
  const cols = {
    id: schema.users.id,
    name: schema.users.name,
    personId: schema.users.personId,
    assignedSiteId: schema.users.assignedSiteId,
    crewId: schema.users.crewId,
  };
  let [u] = await tx
    .select(cols)
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)));
  if (!u) {
    // People lists mix login USERS and labour-master PERSONS — accept a person id too
    // (QA: a people-row link passed people.id here and got NOT_FOUND).
    [u] = await tx
      .select(cols)
      .from(schema.users)
      .where(and(eq(schema.users.personId, userId), isNull(schema.users.deletedAt)));
  }
  if (!u) throw new ApiException('NOT_FOUND', 'Person not found');
  return { id: u.id, name: u.name, personId: u.personId ?? null, assignedSiteId: u.assignedSiteId ?? null, crewId: u.crewId ?? null };
}

/** Mirrors approvals.assertDecideScope's site-membership check (assignedSiteId / crew's site /
 *  driver's vehicle site), generalized to "any of the caller's sites" instead of one request's site.
 *  Round 2 (CW-9) lockdown: only OWNER/SITE_MANAGER ever reach here — assertInsightsRole has
 *  already rejected every other role (including SUPERVISOR) before this runs. */
async function assertPersonAccessible(tx: Tx, ctx: ScopeContext, target: TargetUser): Promise<void> {
  if (ctx.role === 'OWNER') return;
  if (ctx.role === 'SITE_MANAGER') {
    if (target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId)) return;
    if (target.crewId) {
      const [crew] = await tx
        .select({ siteId: schema.crews.siteId })
        .from(schema.crews)
        .where(and(eq(schema.crews.id, target.crewId), isNull(schema.crews.deletedAt)));
      if (crew?.siteId && ctx.siteIds.includes(crew.siteId)) return;
    }
    if (target.personId) {
      const vs = await tx
        .select({ siteId: schema.vehicles.assignedSiteId })
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, target.personId)));
      if (vs.some((v) => v.siteId && ctx.siteIds.includes(v.siteId))) return;
    }
    forbidScope('Person is outside your site scope');
  }
  forbidScope(`Role ${ctx.role} cannot view person insights`);
}

/** Every user "at" a site: assignedSiteId match, member of a crew at that site, or (driver
 *  fallback — drivers carry neither) a vehicle assigned to that site. Used to attribute
 *  requests (which have no siteId column) to a site for OWNER/SITE_MANAGER callers. */
async function usersAtSite(tx: Tx, siteId: string): Promise<string[]> {
  const crews = await tx
    .select({ id: schema.crews.id })
    .from(schema.crews)
    .where(and(isNull(schema.crews.deletedAt), eq(schema.crews.siteId, siteId)));
  const crewIds = crews.map((c) => c.id);
  const direct = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(isNull(schema.users.deletedAt), or(eq(schema.users.assignedSiteId, siteId), inSet(schema.users.crewId, crewIds))));
  const ids = new Set(direct.map((u) => u.id));

  const drivers = await tx
    .select({ id: schema.users.id, personId: schema.users.personId })
    .from(schema.users)
    .where(and(isNull(schema.users.deletedAt), eq(schema.users.role, 'DRIVER')));
  const driverPersonIds = drivers.map((d) => d.personId).filter((x): x is string => !!x);
  if (driverPersonIds.length) {
    const vs = await tx
      .select({ driverPersonId: schema.vehicles.assignedDriverPersonId })
      .from(schema.vehicles)
      .where(
        and(
          isNull(schema.vehicles.deletedAt),
          eq(schema.vehicles.assignedSiteId, siteId),
          inArray(schema.vehicles.assignedDriverPersonId, driverPersonIds),
        ),
      );
    const siteDriverPersonIds = new Set(vs.map((v) => v.driverPersonId).filter((x): x is string => !!x));
    for (const d of drivers) if (d.personId && siteDriverPersonIds.has(d.personId)) ids.add(d.id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Row fetch (one query per record family for the whole window — no per-day queries)
// ---------------------------------------------------------------------------

interface RawRows {
  progress: ProgressNote[];
  expenses: Expense[];
  requests: ApprovalRequest[];
}

async function fetchSiteRows(tx: Tx, siteId: string, from: string, to: string): Promise<RawRows> {
  // Round 2 (CW-9) lockdown: only OWNER/SITE_MANAGER ever reach here (assertInsightsRole gates
  // entry) — always the full site slice, never a crew-narrowed one. SM site-scoping is enforced
  // by the caller passing a siteId already checked via assertSiteAccessible; Owner org behavior
  // is unchanged (site here is just whichever site the Owner asked to see).
  const progressRows = await tx
    .select()
    .from(schema.progressNotes)
    .where(
      and(
        isNull(schema.progressNotes.deletedAt),
        eq(schema.progressNotes.siteId, siteId),
        gte(schema.progressNotes.businessDate, from),
        lte(schema.progressNotes.businessDate, to),
      ),
    );

  const expenseRows = await tx
    .select()
    .from(schema.expenses)
    .where(
      and(
        isNull(schema.expenses.deletedAt),
        eq(schema.expenses.void, false),
        eq(schema.expenses.siteId, siteId),
        gte(schema.expenses.businessDate, from),
        lte(schema.expenses.businessDate, to),
      ),
    );

  const requestScope: SQL = or(
    inSet(schema.approvalRequests.requestedBy, await usersAtSite(tx, siteId)),
    and(eq(schema.approvalRequests.type, 'EXPENSE_ADD'), sql`${schema.approvalRequests.payload} ->> 'siteId' = ${siteId}`),
  ) as SQL;

  const requestRows = await fetchRequestsInWindow(tx, requestScope, from, to);

  return { progress: progressRows.map(mapProgressNote), expenses: expenseRows.map(mapExpense), requests: requestRows };
}

async function fetchPersonRows(tx: Tx, userId: string, from: string, to: string): Promise<RawRows> {
  const progressRows = await tx
    .select()
    .from(schema.progressNotes)
    .where(
      and(
        isNull(schema.progressNotes.deletedAt),
        eq(schema.progressNotes.enteredBy, userId),
        gte(schema.progressNotes.businessDate, from),
        lte(schema.progressNotes.businessDate, to),
      ),
    );

  const expenseRows = await tx
    .select()
    .from(schema.expenses)
    .where(
      and(
        isNull(schema.expenses.deletedAt),
        eq(schema.expenses.void, false),
        eq(schema.expenses.enteredBy, userId),
        gte(schema.expenses.businessDate, from),
        lte(schema.expenses.businessDate, to),
      ),
    );

  const requestRows = await fetchRequestsInWindow(tx, eq(schema.approvalRequests.requestedBy, userId) as SQL, from, to);

  return { progress: progressRows.map(mapProgressNote), expenses: expenseRows.map(mapExpense), requests: requestRows };
}

/** Padded createdAt fetch (covers the widest configured backdate window) + strict bucket-date
 *  re-filter to [from, to] in TS (see the day-bucketing rule in the file header). */
async function fetchRequestsInWindow(tx: Tx, scope: SQL, from: string, to: string): Promise<ApprovalRequest[]> {
  const padFrom = new Date(`${addDays(from, -10)}T00:00:00.000Z`);
  const padTo = new Date(`${addDays(to, 1)}T00:00:00.000Z`);
  const rows = await tx
    .select()
    .from(schema.approvalRequests)
    .where(and(isNull(schema.approvalRequests.deletedAt), gte(schema.approvalRequests.createdAt, padFrom), lte(schema.approvalRequests.createdAt, padTo), scope));
  return rows
    .map(mapApprovalRequest)
    .filter((r) => {
      const d = requestBucketDate(r);
      return d >= from && d <= to;
    });
}

/** See the day-bucketing rule in the file header comment. */
function requestBucketDate(r: ApprovalRequest): string {
  if (r.type === 'EXPENSE_ADD') {
    const bd = r.payload.businessDate;
    if (typeof bd === 'string') return bd;
  }
  return kolkataClock(new Date(r.createdAt)).date;
}

// ---------------------------------------------------------------------------
// Pure grouping (dashboards.service convention: fetch once, group in TS)
// ---------------------------------------------------------------------------

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function buildDayInsights(date: string, progress: ProgressNote[], expenses: Expense[], requests: ApprovalRequest[]): DayInsights {
  const dayProgress = progress.filter((n) => n.businessDate === date);
  const dayExpenses = expenses.filter((e) => e.businessDate === date);
  const dayRequests = requests.filter((r) => requestBucketDate(r) === date);
  return {
    businessDate: date,
    progress: dayProgress,
    expenses: dayExpenses,
    requests: dayRequests,
    noProgress: dayProgress.length === 0,
    totalExpensePaise: dayExpenses.reduce((s, e) => s + e.amountPaise, 0),
  };
}

function buildPeriod(
  from: string,
  to: string,
  progress: ProgressNote[],
  expenses: Expense[],
  requests: ApprovalRequest[],
): { totals: PeriodTotals; days: DayInsights[] } {
  const allDates = eachDate(from, to);
  const days = allDates
    .map((d) => buildDayInsights(d, progress, expenses, requests))
    .sort((a, b) => (a.businessDate < b.businessDate ? 1 : a.businessDate > b.businessDate ? -1 : 0)); // newest first

  const totalExpensePaise = expenses.reduce((s, e) => s + e.amountPaise, 0);
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountPaise;

  const progressDatesWithNotes = new Set(progress.map((n) => n.businessDate));
  const progressDays = allDates.filter((d) => progressDatesWithNotes.has(d)).length;

  const totals: PeriodTotals = {
    from,
    to,
    totalExpensePaise,
    byCategory,
    progressDays,
    noProgressDays: allDates.length - progressDays,
    requestsPending: requests.filter((r) => r.status === 'PENDING').length,
    requestsApproved: requests.filter((r) => r.status === 'APPROVED').length,
    requestsRejected: requests.filter((r) => r.status === 'REJECTED').length,
  };
  return { totals, days };
}

// ---------------------------------------------------------------------------
// Local mappers (copy-local convention — see backend-modules.md; never import
// another module's private mapXxx).
// ---------------------------------------------------------------------------

function mapProgressNote(r: typeof schema.progressNotes.$inferSelect): ProgressNote {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    text: r.text,
    businessDate: r.businessDate,
    enteredBy: r.enteredBy,
    mediaIds: r.mediaIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapExpense(r: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    category: r.category,
    amountPaise: r.amountPaise ?? 0,
    vendorId: r.vendorId ?? null,
    billNo: r.billNo ?? null,
    paidVia: r.paidVia,
    remark: r.remark ?? null,
    receiptMediaId: r.receiptMediaId ?? null,
    businessDate: r.businessDate,
    enteredBy: r.enteredBy,
    void: r.void,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
    // frozen.8 (Round-2 two-tick rule) — plain passthrough, no verification workflow wired yet.
    verifiedBy: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    flagged: r.flagged,
    flagNote: r.flagNote ?? null,
  };
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
    // frozen.8 (Round-2 two-tick rule) — plain passthrough, no verification workflow wired yet.
    verifiedBy: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    flagged: r.flagged,
    flagNote: r.flagNote ?? null,
  };
}
