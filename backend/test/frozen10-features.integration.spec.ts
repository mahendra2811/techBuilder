/**
 * frozen.10 acceptance — proven against the LIVE DB (backend/.env, RLS app role), through the
 * real services (no HTTP layer — same pattern as the other integration specs; RbacGuard /
 * JwtAuthGuard live in the controllers, which we bypass exactly like they do):
 *
 *  1. Decider map (ApprovalsService.decideRequest / assertDecideScope) — SUPERVISOR decides his
 *     crew's VEHICLE_SWITCH only; EXPENSE_ADD is the ACCOUNTANT's alone (SM is fully out of the
 *     money loop now); an ACCOUNTANT approval materializes + auto-verifies the expense (his own
 *     decision IS the tick).
 *  2. Supervisor expense is REQUEST-ONLY (RecordsService.createExpense, SUP-9 aligned to the web
 *     2026-07-19) — no direct booking at any amount; every spend rejects with OVER_DIRECT_LIMIT
 *     so the web form routes it as an accountant-decided EXPENSE_ADD request.
 *  3. Driver fuel rules (RecordsService.createFuelLog, DRV-4/D1) — today-only (no backdating),
 *     amountPaise omitted ⇒ from site stock (paidByDriver=false), supplied ⇒ paidByDriver=true.
 *  4. Complaints (ComplaintsService, SUP-1) — org-scoped sequential complaintNo; an SM may raise
 *     but only target=OWNER; his list = his own raised rows + SM-targeted rows on his site, and
 *     NEVER another user's OWNER-target row; the `{no}` filter is exact.
 *  5. Vendors (VendorsService) — the ACCOUNTANT now runs vendor accounts on his own site.
 *  6. Ledger rollup (CashTransfersService.rollup, ACC-3) — accountant-visible, supervisor-FORBIDDEN.
 *  7. Cash-transfer list filters (ACC-2) — {tag}/{kind} narrow the khata sub-pages.
 *  8. Vehicle allotment (VehiclesService.assignDriver, SUP-7/D5) — a supervisor may re-allot his
 *     crew drivers' vehicles; a non-crew driver is FORBIDDEN.
 *  9. Supervisor single-site scope (scope.util loadScope, SUP-2) — siteIds narrows to exactly the
 *     supervisor's assigned site; crew-driver vehicle REACH still spans other sites (vehicleIds).
 *
 * Test 9 runs BEFORE test 8 on purpose: 8a reassigns the crew driver off the site-B vehicle that
 * 9 asserts is still in scope-reach — mutating shared fixture state, same discipline as the other
 * live-DB specs (fresh disposable org, full teardown by orgId in afterAll).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { RecordsService } from '../src/records/records.service';
import { ComplaintsService } from '../src/complaints/complaints.service';
import { VendorsService } from '../src/vendors/vendors.service';
import { CashTransfersService } from '../src/cash-transfers/cash-transfers.service';
import { VehiclesService } from '../src/vehicles/vehicles.service';
import { loadScope } from '../src/common/scope.util';
import { addDays, businessDateNow } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA = uuidv7();
const vtypeId = uuidv7();
const vehicleA = uuidv7(); // site A — unassigned, used for the allotment test
const vehicleSiteB = uuidv7(); // site B — assigned to the crew driver (SUP-2 scope-reach fixture)
const pW = uuidv7(); // worker person (crew member)
const pD = uuidv7(); // crew driver's person
const pD2 = uuidv7(); // NON-crew driver's person

const ownerId = uuidv7();
const smAId = uuidv7();
const accAId = uuidv7();
const supId = uuidv7();
const workerId = uuidv7();
const driverId = uuidv7();
const driver2Id = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const ACC_A = () => principal(accAId, 'ACCOUNTANT');
const SUP = () => principal(supId, 'SUPERVISOR');
const WORKER = () => principal(workerId, 'WORKER');
const DRIVER = () => principal(driverId, 'DRIVER');

const TODAY = businessDateNow(new Date(), '20:00');
const YESTERDAY = addDays(TODAY, -1);
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('frozen.10 — decider map, supervisor two-tier money, driver fuel, complaints, vendors, ledger scope (live DB)', () => {
  let dbs: DbService;
  let approvals: ApprovalsService;
  let records: RecordsService;
  let complaints: ComplaintsService;
  let vendors: VendorsService;
  let cash: CashTransfersService;
  let vehicles: VehiclesService;

  // shared across the complaint sub-tests (4a → 4c/4d)
  let complaintNo1: number;
  let complaintNo2: number;
  let complaintId1: string;
  let complaintId2: string;

  beforeAll(async () => {
    dbs = new DbService();
    approvals = new ApprovalsService(dbs);
    records = new RecordsService(dbs);
    complaints = new ComplaintsService(dbs);
    vendors = new VendorsService(dbs);
    cash = new CashTransfersService(dbs);
    vehicles = new VehiclesService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'Frozen10Test Co', primaryColor: '#224466' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER', 'ACCOUNTANT'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
      // expense limits omitted → schema defaults (thDirectLimitPaise ₹25,000 = 2_500_000 paise)
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'Frozen10Test Co', code: `f10-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'TA', siteManagerId: smAId, accountantId: accAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'TB', ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        { id: pW, orgId, name: 'Worker', skill: 'UNSKILLED', active: true, ...audit(ownerId) },
        { id: pD, orgId, name: 'Crew Driver', skill: 'DRIVER', active: true, ...audit(ownerId) },
        { id: pD2, orgId, name: 'Other Driver', skill: 'DRIVER', active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values({ id: crewA, orgId, siteId: siteA, supervisorUserId: supId, name: 'Crew A', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([{ orgId, crewId: crewA, personId: pW }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `f10o-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `f10sm-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accAId, orgId, name: 'Acc A', username: `f10a-${accAId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: supId, orgId, name: 'Sup', username: `f10s-${supId.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Worker', username: `f10w-${workerId.slice(-8)}`, role: 'WORKER', personId: pW, assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: driverId, orgId, name: 'Driver', username: `f10d-${driverId.slice(-8)}`, role: 'DRIVER', personId: pD, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: driver2Id, orgId, name: 'Driver2', username: `f10d2-${driver2Id.slice(-8)}`, role: 'DRIVER', personId: pD2, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values([
        { id: vehicleA, orgId, vehicleTypeId: vtypeId, regNo: 'F10-A1', assignedSiteId: siteA, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
        { id: vehicleSiteB, orgId, vehicleTypeId: vtypeId, regNo: 'F10-B1', assignedSiteId: siteB, assignedDriverPersonId: pD, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications,
        schema.complaints,
        schema.cashTransfers,
        schema.expenses,
        schema.approvalRequests,
        schema.vendorPayments,
        schema.vendors,
        schema.fuelLogs,
        schema.vehicles,
        schema.vehicleTypes,
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

  // ---------------------------------------------------------------------------------------
  // 1. Decider map.
  // ---------------------------------------------------------------------------------------
  it('1a. SUPERVISOR approves his crew driver’s VEHICLE_SWITCH request → OK', async () => {
    const reqId = uuidv7();
    await approvals.submitRequest(DRIVER(), { id: reqId, type: 'VEHICLE_SWITCH', payload: { vehicleId: vehicleSiteB } });
    const decided = await approvals.decideRequest(SUP(), reqId, { approve: true });
    expect(decided.status).toBe('APPROVED');
  });

  it('1b. SUPERVISOR deciding an EXPENSE_ADD → FORBIDDEN', async () => {
    const reqId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: reqId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 5_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    await expect(approvals.decideRequest(SUP(), reqId, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('1c. SITE_MANAGER deciding an EXPENSE_ADD → FORBIDDEN (accountant decides)', async () => {
    const reqId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: reqId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 6_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    await expect(approvals.decideRequest(SM_A(), reqId, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('1d. ACCOUNTANT (site-scoped) approving an EXPENSE_ADD → OK, materializes + auto-verifies', async () => {
    const reqId = uuidv7();
    await approvals.submitRequest(WORKER(), {
      id: reqId,
      type: 'EXPENSE_ADD',
      payload: { category: 'FOOD', amountPaise: 7_000, businessDate: TODAY, paidVia: 'CASH' },
    });
    const decided = await approvals.decideRequest(ACC_A(), reqId, { approve: true });
    expect(decided.status).toBe('APPROVED');
    expect(decided.verifiedAt).not.toBeNull();

    const [expRow] = await dbs.runInTenant(orgId, (tx) => tx.select().from(schema.expenses).where(eq(schema.expenses.id, reqId)));
    expect(expRow).toBeDefined();
    expect(expRow!.verifiedAt).not.toBeNull();
    expect(expRow!.amountPaise).toBe(7_000);
  });

  // ---------------------------------------------------------------------------------------
  // 2. Supervisor expense is REQUEST-ONLY (SUP-9, aligned to the web 2026-07-19).
  //    The earlier two-tier "≤₹25k books direct" rule was removed: a supervisor never books an
  //    expense directly through any channel — every spend is an EXPENSE_ADD request the accountant
  //    decides. Both a sub-limit and an over-limit amount now reject with OVER_DIRECT_LIMIT (the
  //    field code the web form converts on to switch to the request flow).
  // ---------------------------------------------------------------------------------------
  it('2a. supervisor direct expense (sub-limit) is refused — request-only', async () => {
    await expect(
      records.createExpense(SUP(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 1_000_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
  });

  it('2b. supervisor direct expense (any larger amount) is refused too', async () => {
    await expect(
      records.createExpense(SUP(), { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 3_000_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
  });

  // ---------------------------------------------------------------------------------------
  // 3. Driver fuel rules (DRV-4 / D1).
  // ---------------------------------------------------------------------------------------
  it('3a. driver fuel log backdated to yesterday → rejected (backdate window is 0 for fuel)', async () => {
    await expect(
      records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleSiteB, amountPaise: 50_000, litres: 5, reading: 500, businessDate: YESTERDAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('3b. driver fuel log today WITHOUT amountPaise → amountPaise null, paidByDriver false', async () => {
    const log = await records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleSiteB, litres: 5, reading: 505, businessDate: TODAY });
    expect(log.amountPaise).toBeNull();
    expect(log.paidByDriver).toBe(false);
  });

  it('3c. driver fuel log today WITH amountPaise → paidByDriver true', async () => {
    const log = await records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleSiteB, amountPaise: 40_000, litres: 4, reading: 510, businessDate: TODAY });
    expect(log.paidByDriver).toBe(true);
  });

  // ---------------------------------------------------------------------------------------
  // 4. Complaints (SUP-1).
  // ---------------------------------------------------------------------------------------
  it('4a. two creates get sequential complaintNo (org-scoped, ≥101)', async () => {
    const c1 = await complaints.create(WORKER(), { id: uuidv7(), target: 'OWNER', text: 'private grievance' });
    const c2 = await complaints.create(WORKER(), { id: uuidv7(), target: 'SITE_MANAGER', text: 'site problem' });
    expect(c1.complaintNo).toBeGreaterThanOrEqual(101);
    expect(c2.complaintNo).toBe(c1.complaintNo + 1);
    complaintNo1 = c1.complaintNo;
    complaintNo2 = c2.complaintNo;
    complaintId1 = c1.id;
    complaintId2 = c2.id;
  });

  it('4b. SITE_MANAGER raising target=OWNER → OK; target=SITE_MANAGER → VALIDATION_FAILED', async () => {
    const smComplaint = await complaints.create(SM_A(), { id: uuidv7(), target: 'OWNER', text: 'an SM grievance' });
    expect(smComplaint.target).toBe('OWNER');
    await expect(
      complaints.create(SM_A(), { id: uuidv7(), target: 'SITE_MANAGER', text: 'invalid target' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { target: 'must be OWNER' } });
  });

  it('4c. SM list includes his own raised complaint AND a worker’s SM-target complaint, never a worker’s OWNER-target one', async () => {
    const smSees = await complaints.list(SM_A());
    expect(smSees.some((c) => c.id === complaintId2)).toBe(true); // worker's SM-target
    expect(smSees.some((c) => c.raisedBy === smAId)).toBe(true); // SM's own raised (4b)
    expect(smSees.some((c) => c.id === complaintId1)).toBe(false); // worker's OWNER-target — private
  });

  it('4d. list with {no} filter returns exactly that complaint', async () => {
    const filtered = await complaints.list(OWNER(), { no: String(complaintNo2) });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe(complaintId2);
    expect(filtered[0]!.complaintNo).toBe(complaintNo2);
  });

  // ---------------------------------------------------------------------------------------
  // 5. Vendors.
  // ---------------------------------------------------------------------------------------
  it('5. ACCOUNTANT create → OK, vendor attached to his site', async () => {
    const v = await vendors.create(ACC_A(), { id: uuidv7(), name: 'Accountant’s Shop' });
    expect(v.siteId).toBe(siteA);
  });

  // ---------------------------------------------------------------------------------------
  // 6. Rollup.
  // ---------------------------------------------------------------------------------------
  it('6. ACCOUNTANT rollup() → returns rows (no throw); SUPERVISOR → FORBIDDEN', async () => {
    const rows = await cash.rollup(ACC_A());
    expect(Array.isArray(rows)).toBe(true);
    await expect(cash.rollup(SUP())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------------------------------
  // 7. Cash-transfer list filters (ACC-2).
  // ---------------------------------------------------------------------------------------
  it('7. {tag:WORK} excludes a SALARY transfer; {kind:RETURN} excludes GIVEs', async () => {
    const workId = uuidv7();
    await cash.create(SM_A(), { id: workId, toUserId: workerId, amountPaise: 20_000, kind: 'GIVE', businessDate: TODAY });
    const salaryId = uuidv7();
    await cash.create(ACC_A(), { id: salaryId, toUserId: workerId, amountPaise: 5_000, kind: 'GIVE', tag: 'SALARY', businessDate: TODAY });
    const returnId = uuidv7();
    await cash.create(WORKER(), { id: returnId, toUserId: smAId, amountPaise: 3_000, kind: 'RETURN', businessDate: TODAY });

    const byTag = await cash.list(OWNER(), { tag: 'WORK' });
    expect(byTag.some((r) => r.id === salaryId)).toBe(false);
    expect(byTag.some((r) => r.id === workId)).toBe(true);
    expect(byTag.some((r) => r.id === returnId)).toBe(true);

    const byKind = await cash.list(OWNER(), { kind: 'RETURN' });
    expect(byKind.some((r) => r.id === workId)).toBe(false);
    expect(byKind.some((r) => r.id === salaryId)).toBe(false);
    expect(byKind.some((r) => r.id === returnId)).toBe(true);
  });

  // ---------------------------------------------------------------------------------------
  // 9. Supervisor single-site scope (SUP-2) — MUST run before 8, which reassigns the crew
  //    driver off vehicleSiteB.
  // ---------------------------------------------------------------------------------------
  it('9. supervisor scope: siteIds = [siteA] only; vehicleIds still reaches the crew driver’s site-B vehicle', async () => {
    const ctx = await dbs.runInTenant(orgId, (tx) => loadScope(tx, SUP()));
    expect(ctx.siteIds).toEqual([siteA]);
    expect(ctx.vehicleIds).toContain(vehicleSiteB);
  });

  // ---------------------------------------------------------------------------------------
  // 8. Vehicle allotment (SUP-7/D5).
  // ---------------------------------------------------------------------------------------
  it('8a. SUPERVISOR assigns his crew driver’s person onto a site vehicle → OK, vehicle row updated', async () => {
    const updated = await vehicles.assignDriver(SUP(), vehicleA, pD);
    expect(updated.assignedDriverPersonId).toBe(pD);
  });

  it('8b. assigning a NON-crew driver’s person → FORBIDDEN', async () => {
    await expect(vehicles.assignDriver(SUP(), vehicleA, pD2)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
