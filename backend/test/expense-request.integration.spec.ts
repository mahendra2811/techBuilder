/**
 * Round-2 money engine (CW-2) — runs against the LIVE DB in backend/.env through the real
 * services (RLS app role). Proves the rewired flow:
 *   caps (worker ₹2,000 · supervisor NO CAP) · supervisor request-only (no direct, SUP-9) · SM ladder removed
 *   · decider map (accountant per-site / SM may approve / supervisor NEVER / owner override)
 *   · TWO-TICK verification (approve ≠ verify; accountant approval = both in one act)
 *   · verified = permanent (no edit/void, even Owner) · 🚩 flag → MONEY_FLAGGED to SM + Owners
 *   · cash tags (WORK khata vs SALARY/PERSONAL draws) · three-giver rule · supervisor not a cash node
 *   · crew-scoped supervisor visibility (sees ONLY his own crew's requests).
 * Org config = schema defaults (worker cap ₹2,000, request window 2d back).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { and, eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { RecordsService } from '../src/records/records.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { CashTransfersService } from '../src/cash-transfers/cash-transfers.service';
import { businessDateNow, addDays } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA1 = uuidv7();
const crewA2 = uuidv7();
const vtypeId = uuidv7();
const vehicleV1 = uuidv7();
const pW1 = uuidv7();
const pW2 = uuidv7();
const pD = uuidv7();
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const accAId = uuidv7(); // siteA's accountant (per-site desk)
const accBId = uuidv7(); // siteB's accountant
const sup1Id = uuidv7(); // crew A1 (worker1 + driver)
const sup2Id = uuidv7(); // crew A2 (worker2)
const driverId = uuidv7();
const worker1Id = uuidv7();
const worker2Id = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const ACC_A = () => principal(accAId, 'ACCOUNTANT');
const ACC_B = () => principal(accBId, 'ACCOUNTANT');
const SUP1 = () => principal(sup1Id, 'SUPERVISOR');
const SUP2 = () => principal(sup2Id, 'SUPERVISOR');
const DRIVER = () => principal(driverId, 'DRIVER');
const WORKER1 = () => principal(worker1Id, 'WORKER');
const WORKER2 = () => principal(worker2Id, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

const expensePayload = (over: Partial<Record<string, unknown>> = {}) => ({
  category: 'SUPPLIES',
  amountPaise: 150_000, // ₹1,500 — under the ₹2,000 default cap
  businessDate: TODAY,
  remark: 'cement bags from the shop',
  ...over,
});

describe.skipIf(!HAS_DB)('Round-2 money engine (live DB, RLS app role)', () => {
  let dbs: DbService;
  let records: RecordsService;
  let approvals: ApprovalsService;
  let cash: CashTransfersService;

  beforeAll(async () => {
    dbs = new DbService();
    records = new RecordsService(dbs);
    approvals = new ApprovalsService(dbs);
    cash = new CashTransfersService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'Round2Test Co', primaryColor: '#222222' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER', 'ACCOUNTANT'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'Round2Test Co', code: `r2test-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'RA', siteManagerId: smAId, accountantId: accAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'RB', siteManagerId: smBId, accountantId: accBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        { id: pW1, orgId, name: 'Worker One', skill: 'UNSKILLED', active: true, ...audit(ownerId) },
        { id: pW2, orgId, name: 'Worker Two', skill: 'UNSKILLED', active: true, ...audit(ownerId) },
        { id: pD, orgId, name: 'Driver Person', skill: 'DRIVER', active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values([
        { id: crewA1, orgId, siteId: siteA, supervisorUserId: sup1Id, name: 'Crew A1', ...audit(ownerId) },
        { id: crewA2, orgId, siteId: siteA, supervisorUserId: sup2Id, name: 'Crew A2', ...audit(ownerId) },
      ]);
      await tx.insert(schema.crewMembers).values([
        { orgId, crewId: crewA1, personId: pW1 },
        { orgId, crewId: crewA2, personId: pW2 },
      ]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `r2o-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `r2sma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'SM B', username: `r2smb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accAId, orgId, name: 'Accountant A', username: `r2aa-${accAId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accBId, orgId, name: 'Accountant B', username: `r2ab-${accBId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: sup1Id, orgId, name: 'Sup One', username: `r2s1-${sup1Id.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteA, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: sup2Id, orgId, name: 'Sup Two', username: `r2s2-${sup2Id.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteA, crewId: crewA2, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        // Round 2: the driver BELONGS to crew A1 (drivers have exactly one supervisor now)
        { id: driverId, orgId, name: 'Driver', username: `r2d-${driverId.slice(-8)}`, role: 'DRIVER', personId: pD, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: worker1Id, orgId, name: 'Worker1', username: `r2w1-${worker1Id.slice(-8)}`, role: 'WORKER', personId: pW1, assignedSiteId: siteA, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: worker2Id, orgId, name: 'Worker2', username: `r2w2-${worker2Id.slice(-8)}`, role: 'WORKER', personId: pW2, assignedSiteId: siteA, crewId: crewA2, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values({ id: vehicleV1, orgId, vehicleTypeId: vtypeId, regNo: 'R2-V1', assignedSiteId: siteA, assignedDriverPersonId: pD, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) });
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications,
        schema.approvalRequests,
        schema.cashTransfers,
        schema.expenses,
        schema.crewMembers,
        schema.crews,
        schema.vehicles,
        schema.vehicleTypes,
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

  const getExpense = (id: string) =>
    dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, id))).then((r) => r[0]);
  const getRequest = (id: string) =>
    dbs.runInTenant(orgId, (tx) => tx.select().from(schema.approvalRequests).where(eq(schema.approvalRequests.id, id))).then((r) => r[0]);

  // ---- submit-side: caps ----
  it('WORKER submits an in-cap request → PENDING, site derived server-side', async () => {
    const id = uuidv7();
    const req = await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    expect(req.status).toBe('PENDING');
    expect((req.payload as { siteId?: string }).siteId).toBe(siteA);
  });

  it('WORKER over the ₹2,000 cap is blocked at submit', async () => {
    await expect(
      approvals.submitRequest(WORKER1(), { id: uuidv7(), type: 'EXPENSE_ADD', payload: expensePayload({ amountPaise: 250_000 }) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('WORKER may not submit any other request type', async () => {
    await expect(
      approvals.submitRequest(WORKER1(), { id: uuidv7(), type: 'LEAVE', payload: { personId: pW1 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('WORKER backdating beyond the window is blocked', async () => {
    await expect(
      approvals.submitRequest(WORKER1(), { id: uuidv7(), type: 'EXPENSE_ADD', payload: expensePayload({ businessDate: addDays(TODAY, -3) }) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SUPERVISOR request has NO cap and NO backdate window (₹50,000, 30 days back → PENDING)', async () => {
    const id = uuidv7();
    const req = await approvals.submitRequest(SUP1(), {
      id,
      type: 'EXPENSE_ADD',
      payload: expensePayload({ amountPaise: 5_000_000, businessDate: addDays(TODAY, -30), siteId: siteA }),
    });
    expect(req.status).toBe('PENDING');
  });

  // ---- decider map ----
  it('SUPERVISOR decides NOTHING — his crew worker’s request is FORBIDDEN to him', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    await expect(approvals.decideRequest(SUP1(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // cleanup noise: accountant rejects it with a reason
    await approvals.decideRequest(ACC_A(), id, { approve: false, comment: 'test cleanup' });
  });

  it('ACCOUNTANT of another site cannot decide (per-site sealing)', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    await expect(approvals.decideRequest(ACC_B(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await approvals.decideRequest(ACC_A(), id, { approve: false, comment: 'test cleanup' });
  });

  it('ACCOUNTANT approval = approve + verify in ONE act; category override wins; enteredBy = spender', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload({ category: 'FOOD' }) });
    const decided = await approvals.decideRequest(ACC_A(), id, { approve: true, categoryOverride: 'SUPPLIES' });
    expect(decided.status).toBe('APPROVED');
    expect(decided.verifiedAt).not.toBeNull();
    expect(decided.verifiedBy).toBe(accAId);

    const row = await getExpense(id);
    expect(row).toBeDefined();
    expect(row!.category).toBe('SUPPLIES');
    expect(row!.enteredBy).toBe(worker1Id);
    expect(row!.verifiedAt).not.toBeNull();
  });

  it('rejecting without a reason fails; with a reason → REJECTED, nothing booked', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    await expect(approvals.decideRequest(ACC_A(), id, { approve: false })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const rejected = await approvals.decideRequest(ACC_A(), id, { approve: false, comment: 'no bill photo' });
    expect(rejected.status).toBe('REJECTED');
    expect(await getExpense(id)).toBeUndefined();
  });

  // ---- two-tick: an ACCOUNTANT (or Owner) approval IS the tick — SM is fully out of the money loop ----
  it('SM approval is FORBIDDEN; accountant approval books the expense ALREADY VERIFIED (no edit/void, even Owner)', async () => {
    const id = uuidv7();
    await approvals.submitRequest(DRIVER(), { id, type: 'EXPENSE_ADD', payload: expensePayload({ category: 'REPAIR' }) });
    // frozen.10: the SM no longer decides money requests at all.
    await expect(approvals.decideRequest(SM_A(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // the site's accountant approves → approval AND verify tick land in the SAME act
    const decided = await approvals.decideRequest(ACC_A(), id, { approve: true });
    expect(decided.status).toBe('APPROVED');
    expect(decided.verifiedAt).not.toBeNull();
    expect(decided.verifiedBy).toBe(accAId);

    const row = await getExpense(id);
    expect(row!.verifiedAt).not.toBeNull();

    // permanent: nobody edits/voids — not even the Owner
    await expect(records.updateRecord(OWNER(), 'expense', id, { amountPaise: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.voidRecord(OWNER(), 'expense', id)).rejects.toMatchObject({ code: 'CONFLICT' });
    // re-verify (the request-path tick) → CONFLICT, already verified
    await expect(approvals.verifyRequest(ACC_A(), id, { ok: true })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // frozen.10: since every EXPENSE_ADD approval (accountant or Owner) auto-verifies in the same
  // act, an APPROVED-but-unverified request can no longer exist — the request-path verify(ok=false)
  // flag is unreachable. The surviving flag surface is a DIRECT expense booking (SM/supervisor),
  // which lands unverified and awaits the accountant's separate tick via RecordsService.verifyExpense.
  it('verify(ok=false) flags a DIRECT SM expense and notifies SM + Owners (MONEY_FLAGGED)', async () => {
    const id = uuidv7();
    await records.createExpense(SM_A(), { id, siteId: siteA, category: 'MISC', amountPaise: 40_000, businessDate: TODAY });
    expect((await getExpense(id))!.verifiedAt).toBeNull();

    await expect(records.verifyExpense(ACC_A(), id, { ok: false })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' }); // note required
    await records.verifyExpense(ACC_A(), id, { ok: false, flagNote: 'no such purchase in my book' });

    const row = await getExpense(id);
    expect(row!.flagged).toBe(true);
    expect(row!.verifiedAt).toBeNull();

    const notes = await dbs.runInTenant(orgId, (tx) =>
      tx.select().from(schema.notifications).where(eq(schema.notifications.type, 'MONEY_FLAGGED')),
    );
    const targets = notes.map((n) => n.userId);
    expect(targets).toContain(smAId);
    expect(targets).toContain(ownerId);
  });

  it('a PENDING request cannot be verified (nothing moved yet)', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER1(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    await expect(approvals.verifyRequest(ACC_A(), id, { ok: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    await approvals.decideRequest(ACC_A(), id, { approve: false, comment: 'test cleanup' });
  });

  // ---- direct entries ----
  // SUP-9 (aligned to the web 2026-07-19): the supervisor NEVER books an expense directly — every
  // spend (any amount) is an accountant-decided EXPENSE_ADD request. Both a small and a large
  // amount reject with OVER_DIRECT_LIMIT (the field code the web form converts on).
  it('SUPERVISOR direct expense is refused at any amount (request-only)', async () => {
    await expect(
      records.createExpense(SUP1(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 5_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
    await expect(
      records.createExpense(SUP1(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 3_000_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
  });

  it('SM direct entry has NO ladder (₹5,00,000 books instantly, unverified); accountant verifies the expense', async () => {
    const id = uuidv7();
    const ok = await records.createExpense(SM_A(), { id, siteId: siteA, category: 'MISC', amountPaise: 50_000_000, businessDate: TODAY });
    expect(ok.amountPaise).toBe(50_000_000);
    expect(ok.verifiedAt).toBeNull();

    const verified = await records.verifyExpense(ACC_A(), id, { ok: true });
    expect(verified.verifiedAt).not.toBeNull();
    await expect(records.verifyExpense(ACC_A(), id, { ok: true })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // ---- cash: tags, three-giver, supervisor not a node ----
  it('WORK cash never touches a SUPERVISOR (neither direction)', async () => {
    await expect(
      cash.create(SM_A(), { id: uuidv7(), toUserId: sup1Id, amountPaise: 10_000, kind: 'GIVE', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      cash.create(SUP1(), { id: uuidv7(), toUserId: worker1Id, amountPaise: 10_000, kind: 'GIVE', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('three-giver rule: a WORKER cannot give SALARY; the SM can — and it lands UNVERIFIED', async () => {
    await expect(
      cash.create(WORKER1(), { id: uuidv7(), toUserId: worker2Id, amountPaise: 5_000, kind: 'GIVE', tag: 'SALARY', businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const id = uuidv7();
    const t = await cash.create(SM_A(), { id, toUserId: worker1Id, amountPaise: 300_000, kind: 'GIVE', tag: 'SALARY', businessDate: TODAY, note: 'going home' });
    expect(t.tag).toBe('SALARY');
    expect(t.verifiedAt).toBeNull();

    // unverified → NOT yet on the worker's "money I've taken" page
    let mine = await cash.myMoney(WORKER1());
    expect(mine.entries.find((e) => e.id === id)).toBeUndefined();

    // the accountant's tick makes it real
    await cash.verifyTransfer(ACC_A(), id, { ok: true });
    mine = await cash.myMoney(WORKER1());
    const entry = mine.entries.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry!.tag).toBe('SALARY');
    expect(entry!.amountPaise).toBe(300_000);
  });

  it('SALARY/PERSONAL draws do NOT move the WORK khata; accountant’s own WORK give is auto-verified', async () => {
    const before = await cash.myBalance(WORKER1());
    // accountant gives WORK cash — auto-verified (he IS the verifier), balance moves
    const workId = uuidv7();
    const w = await cash.create(ACC_A(), { id: workId, toUserId: worker1Id, amountPaise: 50_000, kind: 'GIVE', businessDate: TODAY });
    expect(w.verifiedAt).not.toBeNull();
    const after = await cash.myBalance(WORKER1());
    expect(after.receivedPaise - before.receivedPaise).toBe(50_000);
    // the earlier ₹3,000 SALARY draw is absent from the khata numbers (tag-filtered)
    const salarySum = await dbs.runInTenant(orgId, (tx) =>
      tx
        .select()
        .from(schema.cashTransfers)
        .where(and(eq(schema.cashTransfers.toUserId, worker1Id), eq(schema.cashTransfers.tag, 'SALARY'))),
    );
    expect(salarySum.length).toBeGreaterThan(0); // draws exist…
    expect(after.receivedPaise - before.receivedPaise).toBe(50_000); // …but only WORK moved the khata
  });

  // ---- crew-scoped supervisor visibility ----
  // frozen.10 (SUP-6): the supervisor's inbox = his own requests + his crew's VEHICLE_SWITCH
  // ONLY. Money (EXPENSE_ADD) never reaches him — even from his own crew — and VEHICLE_SWITCH
  // stays crew-scoped (another crew's switch request is still invisible to him).
  it('a SUPERVISOR sees ONLY his own crew’s VEHICLE_SWITCH requests', async () => {
    // his OWN crew's EXPENSE_ADD (driver, crew A1) — invisible: money never reaches a supervisor
    const crewExpenseReq = uuidv7();
    await approvals.submitRequest(DRIVER(), { id: crewExpenseReq, type: 'EXPENSE_ADD', payload: expensePayload() });
    const sup1SeesExpense = await approvals.listRequests(SUP1());
    expect(sup1SeesExpense.find((r) => r.id === crewExpenseReq)).toBeUndefined();

    // his OWN crew's VEHICLE_SWITCH (driver, crew A1) — visible
    const crewSwitchReq = uuidv7();
    await approvals.submitRequest(DRIVER(), { id: crewSwitchReq, type: 'VEHICLE_SWITCH', payload: { vehicleId: vehicleV1 } });
    const sup1SeesSwitch = await approvals.listRequests(SUP1());
    expect(sup1SeesSwitch.find((r) => r.id === crewSwitchReq)).toBeDefined();

    // an OUT-OF-CREW VEHICLE_SWITCH (sup2, crew A2) — invisible to SUP1
    const otherCrewSwitchReq = uuidv7();
    await approvals.submitRequest(SUP2(), { id: otherCrewSwitchReq, type: 'VEHICLE_SWITCH', payload: { vehicleId: vehicleV1 } });
    const sup1Final = await approvals.listRequests(SUP1());
    expect(sup1Final.find((r) => r.id === otherCrewSwitchReq)).toBeUndefined();

    // cleanup noise
    await approvals.decideRequest(ACC_A(), crewExpenseReq, { approve: false, comment: 'test cleanup' });
    await approvals.decideRequest(OWNER(), crewSwitchReq, { approve: false, comment: 'test cleanup' });
    await approvals.decideRequest(OWNER(), otherCrewSwitchReq, { approve: false, comment: 'test cleanup' });
  });
});
