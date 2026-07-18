/**
 * frozen.9 acceptance — three new behaviors proven against the LIVE DB (backend/.env, RLS
 * app role), through the real services (no HTTP layer — same pattern as the other integration
 * specs; RbacGuard/JwtAuthGuard live in the controllers, which we bypass exactly like they do):
 *
 *  1. Khata "spent" counts ONLY approved EXPENSE_ADD requests — a PENDING or REJECTED sibling
 *     never moves the balance (cash-ledger.integration.spec.ts ② already proves a single
 *     SM-approved CASH expense debits the spender's khata; it does NOT prove pending/rejected
 *     siblings are excluded — that is the new assertion here).
 *  2. PATCH /me/guardian — PeopleService.setOwnGuardian: one-time self-add, 403 on a second
 *     attempt, 404 when the caller has no linked labour-master person.
 *  3. GET /users/:id/money — CashTransfersService.userMoney: Owner/self/site-scoped SM+Accountant
 *     may read a subordinate's verified SALARY/PERSONAL history (WORK-tagged transfers excluded);
 *     an out-of-scope SM and a worker reaching for someone else's history are both FORBIDDEN.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { CashTransfersService } from '../src/cash-transfers/cash-transfers.service';
import { PeopleService } from '../src/people/people.service';
import { businessDateNow } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const pW = uuidv7();
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const accAId = uuidv7();
const accBId = uuidv7();
const workerId = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const SM_B = () => principal(smBId, 'SITE_MANAGER');
const ACC_A = () => principal(accAId, 'ACCOUNTANT');
const WORKER = () => principal(workerId, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('frozen.9 — approve-only khata spend, guardian self-add, user-money scope (live DB)', () => {
  let dbs: DbService;
  let approvals: ApprovalsService;
  let cash: CashTransfersService;
  let people: PeopleService;

  beforeAll(async () => {
    dbs = new DbService();
    approvals = new ApprovalsService(dbs);
    cash = new CashTransfersService(dbs);
    people = new PeopleService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'Frozen9Test Co', primaryColor: '#444444' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER', 'ACCOUNTANT'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
      // expense limits omitted → schema defaults (worker request cap ₹2,000)
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'Frozen9Test Co', code: `f9-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'FA', siteManagerId: smAId, accountantId: accAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'FB', siteManagerId: smBId, accountantId: accBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([{ id: pW, orgId, name: 'Worker', skill: 'UNSKILLED', active: true, ...audit(ownerId) }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `f9o-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `f9sma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'SM B', username: `f9smb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accAId, orgId, name: 'Acc A', username: `f9aa-${accAId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accBId, orgId, name: 'Acc B', username: `f9ab-${accBId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Worker', username: `f9w-${workerId.slice(-8)}`, role: 'WORKER', personId: pW, assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [schema.notifications, schema.approvalRequests, schema.cashTransfers, schema.expenses, schema.users, schema.people, schema.sites]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.delete(t).where(eq((t as any).orgId, orgId));
      }
      await tx.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
    });
    await dbs.onModuleDestroy();
  }, 120_000);

  // ---------------------------------------------------------------------------------------
  // 1. Khata "spent" = APPROVED requests only.
  // ---------------------------------------------------------------------------------------
  it('1. worker: ₹500 GIVE + approved ₹200 / pending ₹100 / rejected ₹50 → spentPaise=20000, balancePaise=30000', async () => {
    await cash.create(SM_A(), { id: uuidv7(), toUserId: workerId, amountPaise: 50_000, kind: 'GIVE', businessDate: TODAY });

    const approvedId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: approvedId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 20_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    // frozen.10: the SM is fully out of the money-decide loop — the site's accountant (or Owner) decides.
    await expect(approvals.decideRequest(SM_A(), approvedId, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const decided = await approvals.decideRequest(ACC_A(), approvedId, { approve: true });
    expect(decided.status).toBe('APPROVED');

    const pendingId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: pendingId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 10_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    // left PENDING deliberately — no decide call.

    const rejectedId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: rejectedId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 5_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    const rejected = await approvals.decideRequest(ACC_A(), rejectedId, { approve: false, comment: 'no bill' });
    expect(rejected.status).toBe('REJECTED');

    const bal = await cash.myBalance(WORKER());
    expect(bal).toMatchObject({ receivedPaise: 50_000, givenPaise: 0, spentPaise: 20_000, balancePaise: 30_000 });

    // sanity: pending/rejected requests never materialized an expense row.
    const [pendingExpense] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, pendingId)));
    expect(pendingExpense).toBeUndefined();
    const [rejectedExpense] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, rejectedId)));
    expect(rejectedExpense).toBeUndefined();
  });

  // ---------------------------------------------------------------------------------------
  // 2. PATCH /me/guardian — one-time self-add.
  // ---------------------------------------------------------------------------------------
  it('2a. worker with a linked person + empty guardian fields → 200, both fields saved', async () => {
    const saved = await people.setOwnGuardian(WORKER(), { guardianName: 'Ram Lal', guardianPhone: '9876543210' });
    expect(saved.guardianName).toBe('Ram Lal');
    expect(saved.guardianPhone).toBe('9876543210');

    const [row] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.people).where(eq(schema.people.id, pW)));
    expect(row!.guardianName).toBe('Ram Lal');
    expect(row!.guardianPhone).toBe('9876543210');
  });

  it('2b. the same user PATCHing again → FORBIDDEN (set-once)', async () => {
    await expect(
      people.setOwnGuardian(WORKER(), { guardianName: 'Someone Else', guardianPhone: '9000000000' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('2c. a user with NO linked person (SM login) → NOT_FOUND', async () => {
    await expect(
      people.setOwnGuardian(SM_A(), { guardianName: 'X', guardianPhone: '9111111111' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------------------------
  // 3. GET /users/:id/money — scope.
  // ---------------------------------------------------------------------------------------
  it('3. seed one VERIFIED SALARY transfer + one WORK transfer to the worker', async () => {
    // Accountant-created transfer is auto-verified (his own recording IS the verification).
    const salaryId = uuidv7();
    const salary = await cash.create(ACC_A(), {
      id: salaryId,
      toUserId: workerId,
      amountPaise: 15_000,
      kind: 'GIVE',
      tag: 'SALARY',
      businessDate: TODAY,
    });
    expect(salary.verifiedAt).not.toBeNull();

    // A plain WORK-tag transfer — must never show up in the money-taken history.
    await cash.create(SM_A(), { id: uuidv7(), toUserId: workerId, amountPaise: 10_000, kind: 'GIVE', businessDate: TODAY });

    // (a) OWNER → 200, exactly the SALARY entry, total correct.
    const asOwner = await cash.userMoney(OWNER(), workerId);
    expect(asOwner.entries).toHaveLength(1);
    expect(asOwner.entries[0]).toMatchObject({ id: salaryId, tag: 'SALARY', amountPaise: 15_000 });
    expect(asOwner.totalPaise).toBe(15_000);

    // (b) SM of the worker's own site → 200.
    const asSmA = await cash.userMoney(SM_A(), workerId);
    expect(asSmA.entries).toHaveLength(1);
    expect(asSmA.entries[0].id).toBe(salaryId);

    // (c) SM of a DIFFERENT site → FORBIDDEN.
    await expect(cash.userMoney(SM_B(), workerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // (d) the worker himself → 200 (self always allowed).
    const asSelf = await cash.userMoney(WORKER(), workerId);
    expect(asSelf.entries).toHaveLength(1);
    expect(asSelf.totalPaise).toBe(15_000);

    // (e) the worker requesting someone ELSE's id → FORBIDDEN.
    await expect(cash.userMoney(WORKER(), smAId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
