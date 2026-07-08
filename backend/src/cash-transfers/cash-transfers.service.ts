import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CashTransfer,
  CreateCashTransferInput,
  ExpenseCategory,
  LedgerRollupRow,
  MyBalance,
  Role,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { assertBackdateWindow } from '../common/backdate.util';
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

      const [row] = await tx
        .insert(schema.cashTransfers)
        .values({
          id: input.id,
          orgId: p.orgId,
          fromUserId: fromParty.id,
          toUserId: toParty.id,
          amountPaise: input.amountPaise,
          kind: input.kind,
          businessDate: input.businessDate,
          note: input.note ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
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

  /** Transfers the caller may see: own (from/to) + (SM) any transfer touching a user at their site + (OWNER) all. */
  async list(p: Principal): Promise<CashTransfer[]> {
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
      const rows = await tx
        .select()
        .from(schema.cashTransfers)
        .where(and(isNull(schema.cashTransfers.deletedAt), filter))
        .orderBy(desc(schema.cashTransfers.createdAt));
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
   * Ledger rollup. OWNER = every org user with any ledger/expense activity; SITE_MANAGER = the
   * users at his site(s) + himself; everyone else FORBIDDEN. Aggregated with SQL group-bys (no N+1).
   */
  async rollup(p: Principal): Promise<LedgerRollupRow[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope('Only the Owner or a Site Manager may view the ledger rollup');
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
  if (higher.role === 'SITE_MANAGER') {
    const siteIds = await supervisorSiteIds(tx, higher.id, higher.assignedSiteId);
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
  if (higher.role === 'TEAM_HEAD') {
    const crewIds = await supervisorCrewIds(tx, higher.id, higher.crewId);
    // A Team Head's cash reach is his crew's WORKERs only (drivers are site-level, not in a crew).
    if (lower.role === 'WORKER' && lower.crewId && crewIds.includes(lower.crewId)) return;
    forbidScope('A Team Head can only transfer cash with workers in their own crew');
  }
  // DRIVER / WORKER can never be the higher party (rank 1) — chainAllows would have rejected.
  forbidScope('Transfer is not permitted by the chain');
}

/** SM's site reach: assigned site + every site they manage. */
async function supervisorSiteIds(tx: Tx, userId: string, assignedSiteId: string | null): Promise<string[]> {
  const managed = await tx
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(and(isNull(schema.sites.deletedAt), eq(schema.sites.siteManagerId, userId)));
  return [...new Set([assignedSiteId, ...managed.map((s) => s.id)].filter((x): x is string => !!x))];
}

/** TH's crew reach: own crew + every crew they lead. */
async function supervisorCrewIds(tx: Tx, userId: string, crewId: string | null): Promise<string[]> {
  const led = await tx
    .select({ id: schema.crews.id })
    .from(schema.crews)
    .where(and(isNull(schema.crews.deletedAt), eq(schema.crews.teamHeadUserId, userId)));
  return [...new Set([crewId, ...led.map((c) => c.id)].filter((x): x is string => !!x))];
}

// ---- SQL sum helpers (bigint sums come back as numeric strings → Number()) ----
async function sumTransfers(tx: Tx, where: SQL): Promise<number> {
  const [r] = await tx
    .select({ total: sql<string>`coalesce(sum(${schema.cashTransfers.amountPaise}), 0)` })
    .from(schema.cashTransfers)
    .where(and(isNull(schema.cashTransfers.deletedAt), where));
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
    .where(isNull(schema.cashTransfers.deletedAt))
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
    businessDate: t.businessDate,
    note: t.note ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: t.createdBy ?? t.id,
    updatedBy: t.updatedBy ?? t.id,
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    version: t.version,
  };
}
