/**
 * EXPENSE_ADD acceptance (client-plan v1 / WO-3) — runs against the LIVE DB in backend/.env
 * through the real services (RLS app role). Proves the money engine:
 *   caps · windows · type restriction · routing (worker→TH/SM, driver→SM, SM>₹1L→Owner only)
 *   · reject-needs-reason · approve materializes the booked expense · direct-entry limits.
 * Org config is the schema DEFAULTS: cap ₹2,000 · TH ₹25,000 · SM ₹1,00,000 · windows 2d/7d.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { RecordsService } from '../src/records/records.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { businessDateNow, addDays } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA1 = uuidv7();
const vtypeId = uuidv7();
const vehicleV1 = uuidv7();
const pW1 = uuidv7();
const pD = uuidv7();
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const thId = uuidv7();
const driverId = uuidv7();
const workerId = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const SM_B = () => principal(smBId, 'SITE_MANAGER');
const TH = () => principal(thId, 'TEAM_HEAD');
const DRIVER = () => principal(driverId, 'DRIVER');
const WORKER = () => principal(workerId, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

const expensePayload = (over: Partial<Record<string, unknown>> = {}) => ({
  category: 'SUPPLIES',
  amountPaise: 150_000, // ₹1,500 — under the ₹2,000 default cap
  businessDate: TODAY,
  remark: 'cement bags from the shop',
  ...over,
});

describe.skipIf(!HAS_DB)('EXPENSE_ADD money engine (live DB, RLS app role)', () => {
  let dbs: DbService;
  let records: RecordsService;
  let approvals: ApprovalsService;

  beforeAll(async () => {
    dbs = new DbService();
    records = new RecordsService(dbs);
    approvals = new ApprovalsService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'ExpenseTest Co', primaryColor: '#222222' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
      // expense: omitted on purpose → schema defaults (cap 200000 / TH 2.5M / SM 10M / 2d / 7d)
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'ExpenseTest Co', code: `exptest-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'EA', siteManagerId: smAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'EB', siteManagerId: smBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        { id: pW1, orgId, name: 'Worker One', skill: 'UNSKILLED', active: true, ...audit(ownerId) },
        { id: pD, orgId, name: 'Driver Person', skill: 'DRIVER', active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values({ id: crewA1, orgId, siteId: siteA, teamHeadUserId: thId, name: 'Crew A1', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([{ orgId, crewId: crewA1, personId: pW1 }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `eo-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `esma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'SM B', username: `esmb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: thId, orgId, name: 'TH', username: `eth-${thId.slice(-8)}`, role: 'TEAM_HEAD', assignedSiteId: siteA, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        // driver has NO crewId (site-level by decision) — his site derives from his vehicle
        { id: driverId, orgId, name: 'Driver', username: `ed-${driverId.slice(-8)}`, role: 'DRIVER', personId: pD, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Worker', username: `ew-${workerId.slice(-8)}`, role: 'WORKER', personId: pW1, assignedSiteId: siteA, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values({ id: vehicleV1, orgId, vehicleTypeId: vtypeId, regNo: 'EXP-V1', assignedSiteId: siteA, assignedDriverPersonId: pD, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) });
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications,
        schema.approvalRequests,
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

  // ---- submit-side rules ----
  it('WORKER submits an in-cap expense request → PENDING, site derived server-side', async () => {
    const id = uuidv7();
    const req = await approvals.submitRequest(WORKER(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    expect(req.status).toBe('PENDING');
    expect((req.payload as { siteId?: string }).siteId).toBe(siteA);
  });

  it('WORKER over the ₹2,000 cap is blocked at submit', async () => {
    await expect(
      approvals.submitRequest(WORKER(), { id: uuidv7(), type: 'EXPENSE_ADD', payload: expensePayload({ amountPaise: 250_000 }) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('WORKER may not submit any other request type', async () => {
    await expect(
      approvals.submitRequest(WORKER(), { id: uuidv7(), type: 'LEAVE', payload: { personId: pW1 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('WORKER backdating beyond the 3-day window (today+2) is blocked', async () => {
    await expect(
      approvals.submitRequest(WORKER(), { id: uuidv7(), type: 'EXPENSE_ADD', payload: expensePayload({ businessDate: addDays(TODAY, -3) }) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---- decide-side: TH approves worker; materialization ----
  it('TH approves a worker request with a category override → booked expense (id=request, enteredBy=worker)', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER(), { id, type: 'EXPENSE_ADD', payload: expensePayload({ category: 'FOOD' }) });
    const decided = await approvals.decideRequest(TH(), id, { approve: true, categoryOverride: 'SUPPLIES' });
    expect(decided.status).toBe('APPROVED');

    const [row] = await dbs.runInTenant(orgId, (tx) =>
      tx.select().from(schema.expenses).where(eq(schema.expenses.id, id)),
    );
    expect(row).toBeDefined();
    expect(row!.category).toBe('SUPPLIES'); // decider's choice wins
    expect(row!.enteredBy).toBe(workerId); // the spender, not the decider
    expect(row!.paidVia).toBe('CASH');
    expect(row!.siteId).toBe(siteA);
  });

  it('rejecting an expense request without a reason fails; with a reason → REJECTED and NOT booked', async () => {
    const id = uuidv7();
    await approvals.submitRequest(WORKER(), { id, type: 'EXPENSE_ADD', payload: expensePayload() });
    await expect(approvals.decideRequest(TH(), id, { approve: false })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const rejected = await approvals.decideRequest(TH(), id, { approve: false, comment: 'no bill photo' });
    expect(rejected.status).toBe('REJECTED');
    const [row] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, id)));
    expect(row).toBeUndefined();
  });

  // ---- routing: drivers are site-level → SM, never TH ----
  it('DRIVER request routes past the TH (FORBIDDEN) to the SM (approves fine)', async () => {
    const id = uuidv7();
    const req = await approvals.submitRequest(DRIVER(), { id, type: 'EXPENSE_ADD', payload: expensePayload({ category: 'REPAIR' }) });
    expect((req.payload as { siteId?: string }).siteId).toBe(siteA); // derived from his vehicle's site
    await expect(approvals.decideRequest(TH(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const decided = await approvals.decideRequest(SM_A(), id, { approve: true });
    expect(decided.status).toBe('APPROVED');
  });

  // ---- SM > ₹1L → only the Owner can decide (by construction) ----
  it('SM over-limit request: SM cannot self-decide, SM(B) is out of scope, OWNER approves → booked', async () => {
    const id = uuidv7();
    await approvals.submitRequest(SM_A(), { id, type: 'EXPENSE_ADD', payload: expensePayload({ amountPaise: 12_000_000 }) });
    await expect(approvals.decideRequest(SM_A(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(approvals.decideRequest(SM_B(), id, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const decided = await approvals.decideRequest(OWNER(), id, { approve: true });
    expect(decided.status).toBe('APPROVED');
    const [row] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, id)));
    expect(row?.amountPaise).toBe(12_000_000);
    expect(row?.enteredBy).toBe(smAId);
  });

  // ---- direct-entry per-entry limits ----
  it('TH direct entry over ₹25,000 is refused with OVER_DIRECT_LIMIT', async () => {
    await expect(
      records.createExpense(TH(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 2_600_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
  });

  it('SM direct entry over ₹1,00,000 is refused; under it books instantly', async () => {
    await expect(
      records.createExpense(SM_A(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 10_000_001, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
    const ok = await records.createExpense(SM_A(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 5_000_000, businessDate: TODAY });
    expect(ok.amountPaise).toBe(5_000_000);
  });

  it('TH direct entry 5 days back now works (window widened 2d → 7d)', async () => {
    const ok = await records.createExpense(TH(), { id: uuidv7(), siteId: siteA, category: 'FOOD', amountPaise: 50_000, businessDate: addDays(TODAY, -5) });
    expect(ok.businessDate).toBe(addDays(TODAY, -5));
  });
});
