import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { CASH_TRANSFER_KINDS, MONEY_TAGS } from '@techbuilder/contracts';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CashTransfer,
  CreateCashTransferInput,
  ExpenseCategory,
  LedgerRollupRow,
  MyBalance,
  MyMoney,
  Role,
  VerifyInput,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { assertBackdateWindow } from '../common/backdate.util';
import { assertCanVerify, assertNotVerified, notifyMoneyFlagged, verificationSet } from '../common/verification.util';
import { ROLE_RANK, chainAllows, computeBalance } from './balance-calc';

/** Raw user attributes needed for chain + scope checks (fresh from DB, not the JWT). */
interface LedgerUser {
  id: string;
  role: Role;
  assignedSiteId: string | null;
  crewId: string | null;
  personId: string | null;
  active: boolean;
  deleted: boolean;
}

/**
 * WO-9 — the money ledger ("khata"): advance/petty-cash handed DOWN the chain (GIVE) or
 * returned UP (RETURN). Every method runs inside the tenant tx (RLS isolates the org); the
 * chain (rank) and scope (site/crew) rules are enforced FRESH from the DB, never from the JWT.
 */
@Injectable()
export class CashTransfersService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateCashTransferInput): Promise<CashTransfer> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new ApiException('VALIDATION_FAILED', 'Amount must be a positive integer (paise)', {
        amountPaise: 'positive',
      });
    }
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      // Load caller + recipient fresh (one query). RLS guarantees same-org.
      const ids = [...new Set([p.userId, input.toUserId])];
      const rows = await tx
        .select({
          id: schema.users.id,
          role: schema.users.role,
          assignedSiteId: schema.users.assignedSiteId,
          crewId: schema.users.crewId,
          personId: schema.users.personId,
          active: schema.users.active,
          deletedAt: schema.users.deletedAt,
        })
        .from(schema.users)
        .where(inArray(schema.users.id, ids));
      const toUser = (r: (typeof rows)[number]): LedgerUser => ({
        id: r.id,
        role: r.role,
        assignedSiteId: r.assignedSiteId ?? null,
        crewId: r.crewId ?? null,
        personId: r.personId ?? null,
        active: r.active,
        deleted: !!r.deletedAt,
      });
      const byId = new Map(rows.map((r) => [r.id, toUser(r)]));

      const me = byId.get(p.userId);
      if (!me || !me.active || me.deleted) forbidScope('Your account is inactive');
      const recipient = byId.get(input.toUserId);
      if (!recipient || recipient.deleted) throw new ApiException('NOT_FOUND', 'Recipient not found');
      if (!recipient.active) {
        throw new ApiException('VALIDATION_FAILED', 'Recipient is inactive', { toUserId: 'inactive' });
      }

      // Business date: never the future (no back-limit for the ledger — reuse the shared assert with no window).
      await assertBackdateWindow(tx, me.role, input.businessDate, {});

      const tag = input.tag ?? 'WORK';
      if (tag === 'WORK') {
        // Round 2: the SUPERVISOR is NOT a cash node — he neither holds nor hands out work-cash.
        if (me.role === 'SUPERVISOR' || recipient.role === 'SUPERVISOR') {
          forbidScope('Supervisors are outside the work-cash chain (Round 2) — money requests only');
        }
      } else {
        // SALARY / PERSONAL draw: the three-giver rule — only Owner / SM / Accountant hand
        // personal money, always downward (GIVE); the accountant verifies every claim.
        if (input.kind !== 'GIVE') {
          throw new ApiException('VALIDATION_FAILED', 'Personal/salary draws are always a GIVE', { kind: 'GIVE only' });
        }
        if (me.role !== 'OWNER' && me.role !== 'SITE_MANAGER' && me.role !== 'ACCOUNTANT') {
          forbidScope('Only the Owner, a Site Manager or the Accountant can give salary/personal money');
        }
      }

      // Chain (rank): GIVE down, RETURN up. `from` is the caller — with ONE field-reality
      // exception: a RETURN recorded by the SENIOR party ("the worker handed his balance back
      // to me") is stored as recipient→caller, so both parties may record a return and the
      // canonical row is identical either way.
      const receiverRecordedReturn = input.kind === 'RETURN' && ROLE_RANK[me.role] > ROLE_RANK[recipient.role];
      const fromParty = receiverRecordedReturn ? recipient : me;
      const toParty = receiverRecordedReturn ? me : recipient;
      if (!chainAllows(input.kind, fromParty.role, toParty.role)) {
        forbidScope(
          input.kind === 'GIVE'
            ? 'You can only GIVE cash to someone below you in the chain'
            : 'You can only RETURN cash to someone above you in the chain',
        );
      }

      // Scope: the higher-ranked party of the pair must supervise the lower one.
      const [higher, lower] = input.kind === 'GIVE' ? [me, recipient] : [toParty, fromParty];
      await assertSupervises(tx, higher, lower);

      // Round 2 two-tick: the accountant recording his own move IS the verification (one act,
      // recorded distinctly). Everyone else's claim waits for the accountant's tick.
      const verifyStamp = me.role === 'ACCOUNTANT' ? { verifiedBy: p.userId, verifiedAt: new Date() } : {};

      const [row] = await tx
        .insert(schema.cashTransfers)
        .values({
          id: input.id,
          orgId: p.orgId,
          fromUserId: fromParty.id,
          toUserId: toParty.id,
          amountPaise: input.amountPaise,
          kind: input.kind,
          tag,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
          ...verifyStamp,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.cashTransfers)
          .where(eq(schema.cashTransfers.id, input.id));
        if (existing) return mapCashTransfer(existing);
        throw new ApiException('CONFLICT', 'Could not create cash transfer');
      }
      return mapCashTransfer(row);
    });
  }

  /**
   * Transfers the caller may see: own (from/to) + (SM) any transfer touching a user at their
   * site + (OWNER) all. Bounded by default — this was the app's one truly unbounded
   * lifetime-history read. When `from`/`to` (businessDate range) are given — the Reports/export
   * use case — the cap raises to cover a full export window instead of just recent activity.
   */
  async list(
    p: Principal,
    opts: { limit?: string; from?: string; to?: string; tag?: string; kind?: string } = {},
  ): Promise<CashTransfer[]> {
    const hasRange = !!opts.from && !!opts.to;
    const maxCap = hasRange ? 5000 : 200;
    const limit = Math.min(Math.max(parseInt(opts.limit ?? '', 10) || 100, 1), maxCap);
    // frozen.10 (ACC-2): the khata sub-pages fetch only their own slice.
    const tagFilter =
      opts.tag && (MONEY_TAGS as readonly string[]).includes(opts.tag)
        ? eq(schema.cashTransfers.tag, opts.tag as (typeof MONEY_TAGS)[number])
        : undefined;
    const kindFilter =
      opts.kind && (CASH_TRANSFER_KINDS as readonly string[]).includes(opts.kind)
        ? eq(schema.cashTransfers.kind, opts.kind as (typeof CASH_TRANSFER_KINDS)[number])
        : undefined;
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      let filter: SQL | undefined;
      if (ctx.role === 'OWNER') {
        filter = undefined; // org scope (RLS) — everything
      } else {
        const own = or(
          eq(schema.cashTransfers.fromUserId, ctx.userId),
          eq(schema.cashTransfers.toUserId, ctx.userId),
        ) as SQL;
        if (ctx.role === 'SITE_MANAGER') {
          const siteUsers = tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(and(isNull(schema.users.deletedAt), inSet(schema.users.assignedSiteId, ctx.siteIds)));
          filter = or(
            own,
            inArray(schema.cashTransfers.fromUserId, siteUsers),
            inArray(schema.cashTransfers.toUserId, siteUsers),
          ) as SQL;
        } else {
          filter = own; // TH / DRIVER / WORKER see only their own transfers
        }
      }
      const dateFilter = hasRange
        ? and(gte(schema.cashTransfers.businessDate, opts.from as string), lte(schema.cashTransfers.businessDate, opts.to as string))
        : undefined;
      const rows = await tx
        .select()
        .from(schema.cashTransfers)
        .where(and(isNull(schema.cashTransfers.deletedAt), filter, dateFilter, tagFilter, kindFilter))
        .orderBy(desc(schema.cashTransfers.createdAt))
        .limit(limit);
      return rows.map(mapCashTransfer);
    });
  }

  /** The caller's own khata. */
  async myBalance(p: Principal): Promise<MyBalance> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const received = await sumTransfers(tx, eq(schema.cashTransfers.toUserId, p.userId));
      const given = await sumTransfers(tx, eq(schema.cashTransfers.fromUserId, p.userId));
      const cashSpent = await sumCashSpent(tx, eq(schema.expenses.enteredBy, p.userId));
      return computeBalance({ received, given, cashSpent });
    });
  }

  /**
   * Round 2 (C10) — "money I've taken": the caller's own VERIFIED SALARY/PERSONAL draws,
   * date-wise with the tag. Only accountant-verified entries appear (the claim isn't money
   * until the tick). Self-scoped: every role sees exactly his own list.
   */
  async myMoney(p: Principal, tag?: string): Promise<MyMoney> {
    // frozen.11: ?tag=WORK flips the list to the caller's khata CREDITS (work cash handed to
    // him, any verification state) — the worker/driver "money received" view. Default stays
    // the verified SALARY/PERSONAL draws.
    return this.dbs.runInTenant(p.orgId, (tx) => moneyTakenOf(tx, p.userId, tag === 'WORK' ? 'WORK' : 'PERSONAL_DRAWS'));
  }

  /**
   * frozen.9 — an upper role reads a subordinate's money-taken history (the Profile page's
   * "money taken" section on the person-detail view). Same shape as myMoney; scope enforced
   * FRESH from the DB: OWNER any; SM/ACCOUNTANT only when the target sits at one of their
   * sites (drivers carry no assignedSiteId — their site derives from the vehicle assignment).
   */
  async userMoney(p: Principal, targetUserId: string): Promise<MyMoney> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.userId !== targetUserId && ctx.role !== 'OWNER') {
        if (ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
          forbidScope('Only the Owner, a Site Manager or the Accountant may view another person’s money history');
        }
        const site = await partySiteIn(tx, targetUserId, ctx.siteIds);
        if (!site || !ctx.siteIds.includes(site)) forbidScope('This person is outside your site scope');
      }
      return moneyTakenOf(tx, targetUserId);
    });
  }

  /**
   * Round 2 two-tick: the accountant's verdict on a cash-transfer claim. Scope: the accountant
   * may verify a transfer when either party belongs to his site(s); the Owner may always.
   * ok=false → 🚩 flagged + MONEY_FLAGGED to the site SM + Owners.
   */
  async verifyTransfer(p: Principal, id: string, input: VerifyInput): Promise<CashTransfer> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [row] = await tx.select().from(schema.cashTransfers).where(eq(schema.cashTransfers.id, id));
      assertNotVerified(row, 'Cash transfer');
      const t = row!;
      // Derive a site for the scope check from either party (receiver first — the money landed there).
      const siteId =
        (await partySiteIn(tx, t.toUserId, ctx.siteIds)) ?? (await partySiteIn(tx, t.fromUserId, ctx.siteIds));
      assertCanVerify(ctx, siteId);

      const set = verificationSet(ctx, input);
      const [updated] = await tx.update(schema.cashTransfers).set(set).where(eq(schema.cashTransfers.id, id)).returning();
      if (!updated) throw new ApiException('NOT_FOUND', 'Cash transfer not found');

      if (!input.ok) {
        await notifyMoneyFlagged(tx, t.orgId, siteId, {
          kind: 'cash-transfer',
          transferId: t.id,
          flagNote: input.flagNote,
          fromUserId: t.fromUserId,
          toUserId: t.toUserId,
          amountPaise: t.amountPaise,
          tag: t.tag,
        });
      }
      return mapCashTransfer(updated);
    });
  }

  /**
   * Ledger rollup ("who holds what" — WORK cash only). OWNER = every org user with any
   * ledger/expense activity; SITE_MANAGER / ACCOUNTANT (frozen.10 ACC-3) = the users at
   * his site(s) + himself; everyone else FORBIDDEN. Aggregated with SQL group-bys (no N+1).
   */
  async rollup(p: Principal): Promise<LedgerRollupRow[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER' && ctx.role !== 'ACCOUNTANT') {
        forbidScope('Only the Owner, a Site Manager or the Accountant may view the ledger rollup');
      }

      const dir = await tx
        .select({
          id: schema.users.id,
          name: schema.users.name,
          role: schema.users.role,
          assignedSiteId: schema.users.assignedSiteId,
        })
        .from(schema.users)
        .where(isNull(schema.users.deletedAt));
      const dirById = new Map(dir.map((u) => [u.id, u]));

      // Group-by aggregates (org-scoped by RLS).
      const receivedMap = await groupTransfers(tx, schema.cashTransfers.toUserId);
      const givenMap = await groupTransfers(tx, schema.cashTransfers.fromUserId);
      const spentMap = await groupCashSpent(tx);
      const byCatMap = await groupCategory(tx);

      // Candidate user set.
      let candidateIds: string[];
      if (ctx.role === 'OWNER') {
        candidateIds = [...new Set([...receivedMap.keys(), ...givenMap.keys(), ...spentMap.keys()])];
      } else {
        const siteUserIds = dir
          .filter((u) => u.assignedSiteId && ctx.siteIds.includes(u.assignedSiteId))
          .map((u) => u.id);
        candidateIds = [...new Set([...siteUserIds, ctx.userId])];
      }

      const out: LedgerRollupRow[] = [];
      for (const userId of candidateIds) {
        const u = dirById.get(userId);
        if (!u) continue; // deleted/unknown — skip
        const balance = computeBalance({
          received: receivedMap.get(userId) ?? 0,
          given: givenMap.get(userId) ?? 0,
          cashSpent: spentMap.get(userId) ?? 0,
        });
        out.push({
          userId,
          name: u.name,
          role: u.role,
          ...balance,
          byCategory: byCatMap.get(userId) ?? {},
        });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    });
  }
}

// ---- scope: does `higher` supervise `lower`? (rank already proven by chainAllows) ----
async function assertSupervises(tx: Tx, higher: LedgerUser, lower: LedgerUser): Promise<void> {
  if (higher.role === 'OWNER') return; // org scope — anyone
  if (higher.role === 'SITE_MANAGER' || higher.role === 'ACCOUNTANT') {
    // Round 2: the per-site ACCOUNTANT's cash reach mirrors the SM pattern (sites.accountant_id).
    const siteIds = await seniorSiteIds(tx, higher.id, higher.role, higher.assignedSiteId);
    if (lower.assignedSiteId && siteIds.includes(lower.assignedSiteId)) return;
    // Drivers carry no assignedSiteId — their site comes from their vehicle assignment.
    if (lower.personId) {
      const vs = await tx
        .select({ siteId: schema.vehicles.assignedSiteId })
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, lower.personId)));
      if (vs.some((v) => v.siteId && siteIds.includes(v.siteId))) return;
    }
    forbidScope('The other party is outside your site scope');
  }
  // Round 2: SUPERVISOR is no longer a cash node (WORK is blocked upstream; rank 2 also can't
  // out-rank anyone who matters here). DRIVER / WORKER can never be the higher party (rank 1).
  forbidScope('Transfer is not permitted by the chain');
}

/** A user's money-taken list, newest first + running total (the MyMoney shape), with resolved
 *  giver names. Two modes: 'PERSONAL_DRAWS' (default — VERIFIED SALARY/PERSONAL only) and
 *  'WORK' (frozen.11 — khata credits handed to him, any verification state). Shared by the
 *  self view (myMoney) and the upper-role view (userMoney). */
async function moneyTakenOf(tx: Tx, userId: string, mode: 'PERSONAL_DRAWS' | 'WORK' = 'PERSONAL_DRAWS'): Promise<MyMoney> {
  const modeFilter =
    mode === 'WORK'
      ? [eq(schema.cashTransfers.tag, 'WORK' as const)]
      : [sql`${schema.cashTransfers.tag} <> 'WORK'`, sql`${schema.cashTransfers.verifiedAt} IS NOT NULL`];
  const rows = await tx
    .select({
      id: schema.cashTransfers.id,
      businessDate: schema.cashTransfers.businessDate,
      amountPaise: schema.cashTransfers.amountPaise,
      tag: schema.cashTransfers.tag,
      fromUserId: schema.cashTransfers.fromUserId,
      fromName: schema.users.name,
      note: schema.cashTransfers.note,
      verifiedAt: schema.cashTransfers.verifiedAt,
    })
    .from(schema.cashTransfers)
    .leftJoin(schema.users, eq(schema.users.id, schema.cashTransfers.fromUserId))
    .where(and(isNull(schema.cashTransfers.deletedAt), eq(schema.cashTransfers.toUserId, userId), ...modeFilter))
    .orderBy(desc(schema.cashTransfers.businessDate));
  const entries = rows.map((r) => ({
    id: r.id,
    businessDate: r.businessDate,
    amountPaise: r.amountPaise,
    tag: r.tag,
    fromUserId: r.fromUserId,
    fromName: r.fromName ?? '—',
    note: r.note ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
  }));
  return { entries, totalPaise: entries.reduce((s, e) => s + e.amountPaise, 0) };
}

/** The first of a user's sites (assigned or vehicle-derived) that falls inside `siteIds` —
 *  or their first site at all when `siteIds` is empty (Owner case). Used by verifyTransfer. */
async function partySiteIn(tx: Tx, userId: string, siteIds: string[]): Promise<string | null> {
  const [u] = await tx
    .select({ assignedSiteId: schema.users.assignedSiteId, personId: schema.users.personId })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u) return null;
  const candidates: string[] = u.assignedSiteId ? [u.assignedSiteId] : [];
  if (u.personId) {
    const vs = await tx
      .select({ siteId: schema.vehicles.assignedSiteId })
      .from(schema.vehicles)
      .where(and(isNull(schema.vehicles.deletedAt), eq(schema.vehicles.assignedDriverPersonId, u.personId)));
    vs.forEach((v) => v.siteId && candidates.push(v.siteId));
  }
  if (!candidates.length) return null;
  return candidates.find((s) => siteIds.includes(s)) ?? candidates[0] ?? null;
}

/** A senior's site reach: assigned site + every site they manage (SM) / keep the books for (accountant). */
async function seniorSiteIds(tx: Tx, userId: string, role: Role, assignedSiteId: string | null): Promise<string[]> {
  const col = role === 'ACCOUNTANT' ? schema.sites.accountantId : schema.sites.siteManagerId;
  const managed = await tx
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(and(isNull(schema.sites.deletedAt), eq(col, userId)));
  return [...new Set([assignedSiteId, ...managed.map((s) => s.id)].filter((x): x is string => !!x))];
}

// ---- SQL sum helpers (bigint sums come back as numeric strings → Number()) ----
// Round 2: the khata is WORK-cash only — SALARY/PERSONAL draws live on the "money I've taken"
// page and never move a work balance.
async function sumTransfers(tx: Tx, where: SQL): Promise<number> {
  const [r] = await tx
    .select({ total: sql<string>`coalesce(sum(${schema.cashTransfers.amountPaise}), 0)` })
    .from(schema.cashTransfers)
    .where(and(isNull(schema.cashTransfers.deletedAt), eq(schema.cashTransfers.tag, 'WORK'), where));
  return Number(r?.total ?? 0);
}

async function sumCashSpent(tx: Tx, where: SQL): Promise<number> {
  const [r] = await tx
    .select({ total: sql<string>`coalesce(sum(${schema.expenses.amountPaise}), 0)` })
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.paidVia, 'CASH'),
        eq(schema.expenses.void, false),
        isNull(schema.expenses.deletedAt),
        where,
      ),
    );
  return Number(r?.total ?? 0);
}

/** SUM(amountPaise) of (non-deleted) transfers grouped by a from/to column → Map<userId, paise>. */
async function groupTransfers(
  tx: Tx,
  groupCol: typeof schema.cashTransfers.toUserId | typeof schema.cashTransfers.fromUserId,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({ userId: groupCol, total: sql<string>`coalesce(sum(${schema.cashTransfers.amountPaise}), 0)` })
    .from(schema.cashTransfers)
    .where(and(isNull(schema.cashTransfers.deletedAt), eq(schema.cashTransfers.tag, 'WORK')))
    .groupBy(groupCol);
  return new Map(rows.map((r) => [r.userId, Number(r.total)]));
}

/** Filter for "counts against a khata": approved CASH expense, not void, not deleted. */
const CASH_SPENT_WHERE = () =>
  and(eq(schema.expenses.paidVia, 'CASH'), eq(schema.expenses.void, false), isNull(schema.expenses.deletedAt));

/** SUM(amountPaise) of cash-spent expenses grouped by enteredBy → Map<userId, paise>. */
async function groupCashSpent(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx
    .select({ userId: schema.expenses.enteredBy, total: sql<string>`coalesce(sum(${schema.expenses.amountPaise}), 0)` })
    .from(schema.expenses)
    .where(CASH_SPENT_WHERE())
    .groupBy(schema.expenses.enteredBy);
  return new Map(rows.map((r) => [r.userId, Number(r.total)]));
}

/** SUM(amountPaise) of cash-spent expenses grouped by (enteredBy, category) → Map<userId, {cat: paise}>. */
async function groupCategory(tx: Tx): Promise<Map<string, Partial<Record<ExpenseCategory, number>>>> {
  const rows = await tx
    .select({
      userId: schema.expenses.enteredBy,
      category: schema.expenses.category,
      total: sql<string>`coalesce(sum(${schema.expenses.amountPaise}), 0)`,
    })
    .from(schema.expenses)
    .where(CASH_SPENT_WHERE())
    .groupBy(schema.expenses.enteredBy, schema.expenses.category);
  const map = new Map<string, Partial<Record<ExpenseCategory, number>>>();
  for (const r of rows) {
    const cur = map.get(r.userId) ?? {};
    cur[r.category] = (cur[r.category] ?? 0) + Number(r.total);
    map.set(r.userId, cur);
  }
  return map;
}

function mapCashTransfer(t: typeof schema.cashTransfers.$inferSelect): CashTransfer {
  return {
    id: t.id,
    orgId: t.orgId,
    fromUserId: t.fromUserId,
    toUserId: t.toUserId,
    amountPaise: t.amountPaise,
    kind: t.kind,
    // frozen.8 (Round-2 SALARY/PERSONAL khata) — passthrough; every transfer this WO creates is
    // still 'WORK' (the personal-draw UI/logic is a later WO, matches the DB column default).
    tag: t.tag,
    businessDate: t.businessDate,
    note: t.note ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: t.createdBy ?? t.id,
    updatedBy: t.updatedBy ?? t.id,
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    version: t.version,
    // frozen.8 (Round-2 two-tick rule) — plain passthrough; no verification workflow wired yet.
    verifiedBy: t.verifiedBy ?? null,
    verifiedAt: t.verifiedAt ? t.verifiedAt.toISOString() : null,
    flagged: t.flagged,
    flagNote: t.flagNote ?? null,
  };
}
