/**
 * WO-9 CASH LEDGER acceptance — runs against the LIVE DB in backend/.env through the real
 * services (RLS app role). Proves the khata engine end-to-end:
 *   GIVE down the chain · RETURN up · balance = received − given − CASH-spent ·
 *   the approval→expense→deduction link (a worker's approved CASH expense debits HIS khata) ·
 *   VENDOR_CREDIT never deducts · chain + scope violations · SM-scoped rollup + byCategory.
 * Org config = schema DEFAULTS (request cap ₹2,000; TH ₹25k / SM ₹1L direct limits).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { CashTransfersService } from '../src/cash-transfers/cash-transfers.service';
import { RecordsService } from '../src/records/records.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { businessDateNow } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA = uuidv7();
const pW1 = uuidv7();
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const thId = uuidv7();
const workerId = uuidv7();
const workerBId = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const TH = () => principal(thId, 'TEAM_HEAD');
const WORKER = () => principal(workerId, 'WORKER');
const WORKER_B = () => principal(workerBId, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('WO-9 cash ledger (live DB, RLS app role)', () => {
  let dbs: DbService;
  let cash: CashTransfersService;
  let records: RecordsService;
  let approvals: ApprovalsService;

  beforeAll(async () => {
    dbs = new DbService();
    cash = new CashTransfersService(dbs);
    records = new RecordsService(dbs);
    approvals = new ApprovalsService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'CashTest Co', primaryColor: '#222222' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
      // expense omitted → schema defaults (request cap 200000 / TH 2.5M / SM 10M)
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'CashTest Co', code: `cash-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'CA', siteManagerId: smAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'CB', siteManagerId: smBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([{ id: pW1, orgId, name: 'Worker One', skill: 'UNSKILLED', active: true, ...audit(ownerId) }]);
      await tx.insert(schema.crews).values({ id: crewA, orgId, siteId: siteA, teamHeadUserId: thId, name: 'Crew A', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([{ orgId, crewId: crewA, personId: pW1 }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `co-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `csma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'SM B', username: `csmb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: thId, orgId, name: 'TH', username: `cth-${thId.slice(-8)}`, role: 'TEAM_HEAD', assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Worker', username: `cw-${workerId.slice(-8)}`, role: 'WORKER', personId: pW1, assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        // worker on the OTHER site, no crew — used to prove chain + scope rejections
        { id: workerBId, orgId, name: 'Worker B', username: `cwb-${workerBId.slice(-8)}`, role: 'WORKER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications,
        schema.cashTransfers,
        schema.approvalRequests,
        schema.expenses,
        schema.crewMembers,
        schema.crews,
        schema.users,
        schema.people,
        schema.sites,
      ]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.delete(t).where(eq((t as any).orgId, orgId));
      }
      await tx.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
    });
    await dbs.onModuleDestroy();
  }, 120_000);

  // ① Owner GIVEs ₹1,00,000 (10,000,000 paise) down to SM A.
  it('① Owner GIVEs ₹1,00,000 to SM → SM received 10,000,000, Owner given 10,000,000', async () => {
    const t = await cash.create(OWNER(), { id: uuidv7(), toUserId: smAId, amountPaise: 10_000_000, kind: 'GIVE', businessDate: TODAY });
    expect(t.fromUserId).toBe(ownerId);
    expect(t.toUserId).toBe(smAId);
    expect(t.kind).toBe('GIVE');

    const sm = await cash.myBalance(SM_A());
    expect(sm).toMatchObject({ receivedPaise: 10_000_000, givenPaise: 0, spentPaise: 0, balancePaise: 10_000_000 });

    const owner = await cash.myBalance(OWNER());
    expect(owner).toMatchObject({ receivedPaise: 0, givenPaise: 10_000_000, balancePaise: -10_000_000 });
  });

  // ② SM GIVEs ₹500 to a worker; worker's approved ₹300 CASH expense debits the worker's khata.
  it('② SM GIVEs ₹500 to worker; worker ₹300 CASH expense (TH-approved) → worker balance ₹200', async () => {
    await cash.create(SM_A(), { id: uuidv7(), toUserId: workerId, amountPaise: 50_000, kind: 'GIVE', businessDate: TODAY });

    const reqId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: reqId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 30_000, businessDate: TODAY },
    });
    const decided = await approvals.decideRequest(TH(), reqId, { approve: true });
    expect(decided.status).toBe('APPROVED');

    // the materialized expense is a CASH expense entered by the worker → debits HIS khata
    const [row] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, reqId)));
    expect(row!.enteredBy).toBe(workerId);
    expect(row!.paidVia).toBe('CASH');

    const w = await cash.myBalance(WORKER());
    expect(w).toMatchObject({ receivedPaise: 50_000, givenPaise: 0, spentPaise: 30_000, balancePaise: 20_000 });
  });

  // ③ A VENDOR_CREDIT (udhaar) expense is NOT cash out of anyone's khata.
  it('③ SM VENDOR_CREDIT expense does NOT change the SM balance', async () => {
    const before = await cash.myBalance(SM_A()); // received 10,000,000 − given 50,000 = 9,950,000
    expect(before.balancePaise).toBe(9_950_000);
    expect(before.spentPaise).toBe(0);

    await records.createExpense(SM_A(), {
      id: uuidv7(),
      siteId: siteA,
      category: 'SUPPLIES',
      amountPaise: 100_000, // ₹1,000 on vendor credit
      businessDate: TODAY,
      paidVia: 'VENDOR_CREDIT',
    });

    const after = await cash.myBalance(SM_A());
    expect(after).toMatchObject({ spentPaise: 0, balancePaise: 9_950_000 });
  });

  // ④ Worker RETURNs the ₹200 remainder UP to the SM → both khatas adjust.
  it('④ worker RETURNs ₹200 to SM → worker balance 0, SM received +₹200', async () => {
    await cash.create(WORKER(), { id: uuidv7(), toUserId: smAId, amountPaise: 20_000, kind: 'RETURN', businessDate: TODAY });

    const w = await cash.myBalance(WORKER());
    expect(w).toMatchObject({ receivedPaise: 50_000, givenPaise: 20_000, spentPaise: 30_000, balancePaise: 0 });

    const sm = await cash.myBalance(SM_A());
    expect(sm).toMatchObject({ receivedPaise: 10_020_000, givenPaise: 50_000, balancePaise: 9_970_000 });

    // the worker's ledger list shows exactly his two transfers (received + returned)
    const list = await cash.list(WORKER());
    expect(list).toHaveLength(2);
    expect(new Set(list.map((t) => t.kind))).toEqual(new Set(['GIVE', 'RETURN']));
  });

  // ⑤ Chain + scope violations.
  it('⑤a worker GIVE to another worker is FORBIDDEN (equal rank — nobody is above)', async () => {
    await expect(
      cash.create(WORKER(), { id: uuidv7(), toUserId: workerBId, amountPaise: 10_000, kind: 'GIVE', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('⑤b TH GIVE to a worker outside his crew/site is FORBIDDEN (scope)', async () => {
    await expect(
      cash.create(TH(), { id: uuidv7(), toUserId: workerBId, amountPaise: 10_000, kind: 'GIVE', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('⑤c receiver-recorded RETURN: SM records "worker returned ₹100 to me" → stored worker→SM', async () => {
    // The senior receiving the cash records it (field reality) — stored canonically as lower→higher.
    const before = await cash.myBalance(WORKER());
    await cash.create(SM_A(), { id: uuidv7(), toUserId: workerId, amountPaise: 10_000, kind: 'RETURN', businessDate: TODAY });
    const after = await cash.myBalance(WORKER());
    expect(after.givenPaise - before.givenPaise).toBe(10_000); // debited from the WORKER, not the SM
    expect(after.balancePaise).toBe(before.balancePaise - 10_000);
  });

  it('⑤c2 RETURN between equal ranks is FORBIDDEN', async () => {
    await expect(
      cash.create(WORKER(), { id: uuidv7(), toUserId: workerBId, amountPaise: 5_000, kind: 'RETURN', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('⑤d future-dated transfer is rejected', async () => {
    const tomorrow = businessDateNow(new Date(Date.now() + 2 * 86_400_000), '20:00');
    await expect(
      cash.create(OWNER(), { id: uuidv7(), toUserId: smAId, amountPaise: 10_000, kind: 'GIVE', businessDate: tomorrow }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  // ⑥ SM rollup — only his site's users, correct byCategory, other-site users excluded.
  it('⑥ SM rollup shows only his site users with correct balances + byCategory', async () => {
    const rows = await cash.rollup(SM_A());
    const ids = new Set(rows.map((r) => r.userId));
    expect(ids.has(smAId)).toBe(true);
    expect(ids.has(thId)).toBe(true);
    expect(ids.has(workerId)).toBe(true);
    expect(ids.has(workerBId)).toBe(false); // other site
    expect(ids.has(ownerId)).toBe(false); // not a site A user
    expect(ids.has(smBId)).toBe(false);

    // Post-⑤c numbers: the receiver-recorded RETURN debited the worker another ₹100.
    const w = rows.find((r) => r.userId === workerId)!;
    expect(w).toMatchObject({ receivedPaise: 50_000, givenPaise: 30_000, spentPaise: 30_000, balancePaise: -10_000 });
    expect(w.byCategory).toEqual({ FOOD: 30_000 });

    const sm = rows.find((r) => r.userId === smAId)!;
    expect(sm.balancePaise).toBe(9_980_000);
    expect(sm.byCategory).toEqual({}); // his only expense was VENDOR_CREDIT (not cash) → no cash-spend categories
  });

  it('⑥b non-privileged roles cannot read the rollup', async () => {
    await expect(cash.rollup(WORKER())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cash.rollup(TH())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('⑥c Owner rollup includes every user with ledger activity', async () => {
    const rows = await cash.rollup(OWNER());
    const ids = new Set(rows.map((r) => r.userId));
    // owner (gave), smA (received/gave), worker (received/gave/spent) all have activity
    expect(ids.has(ownerId)).toBe(true);
    expect(ids.has(smAId)).toBe(true);
    expect(ids.has(workerId)).toBe(true);
    // workerB never transacted → no activity → absent
    expect(ids.has(workerBId)).toBe(false);
  });
});
