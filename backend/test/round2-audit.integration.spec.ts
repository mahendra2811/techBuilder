/**
 * Round-2 FINAL AUDIT (CW-11) — the §6 visibility matrix as sealed-box tests vs the LIVE DB.
 * Covers the invariants no other spec asserts:
 *   vehicle-doc vault invisible to accountant/supervisor/driver/worker · complaint OWNER-target
 *   privacy · accountant queue per-site sealing + role gate · accountant gets NO insights ·
 *   material per-type driver-pick rule + finalized stamping · diesel two-sided match E2E
 *   (confirm + mismatch → 🚩 flags for accountant/SM/owner).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { RecordsService } from '../src/records/records.service';
import { MaterialsService } from '../src/materials/materials.service';
import { FuelStockService } from '../src/fuel-stock/fuel-stock.service';
import { VehicleDocsService } from '../src/vehicle-docs/vehicle-docs.service';
import { ComplaintsService } from '../src/complaints/complaints.service';
import { AccountantService } from '../src/accountant/accountant.service';
import { CashTransfersService } from '../src/cash-transfers/cash-transfers.service';
import { InsightsService } from '../src/insights/insights.service';
import { businessDateNow } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA = uuidv7();
const vtypeId = uuidv7();
const vehicleA = uuidv7();
const vehicleB = uuidv7(); // site B — for cross-site doc checks
const pW = uuidv7();
const pD = uuidv7();
const matCement = uuidv7(); // supervisor-only logs
const matSand = uuidv7(); // driverPicks
const ownerId = uuidv7();
const smAId = uuidv7();
const accAId = uuidv7();
const accBId = uuidv7();
const supId = uuidv7();
const driverId = uuidv7();
const workerId = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const ACC_A = () => principal(accAId, 'ACCOUNTANT');
const ACC_B = () => principal(accBId, 'ACCOUNTANT');
const SUP = () => principal(supId, 'SUPERVISOR');
const DRIVER = () => principal(driverId, 'DRIVER');
const WORKER = () => principal(workerId, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('Round-2 final audit — visibility matrix (live DB)', () => {
  let dbs: DbService;
  let records: RecordsService;
  let materials: MaterialsService;
  let fuel: FuelStockService;
  let docs: VehicleDocsService;
  let complaints: ComplaintsService;
  let accountant: AccountantService;
  let cash: CashTransfersService;
  let insights: InsightsService;

  beforeAll(async () => {
    dbs = new DbService();
    records = new RecordsService(dbs);
    materials = new MaterialsService(dbs);
    fuel = new FuelStockService(dbs);
    docs = new VehicleDocsService(dbs);
    complaints = new ComplaintsService(dbs);
    cash = new CashTransfersService(dbs);
    accountant = new AccountantService(dbs, cash, fuel);
    insights = new InsightsService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'AuditTest Co', primaryColor: '#333333' },
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
      await tx.insert(schema.orgs).values({ id: orgId, name: 'AuditTest Co', code: `audit-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'AA', siteManagerId: smAId, accountantId: accAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'AB', accountantId: accBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        { id: pW, orgId, name: 'W', skill: 'UNSKILLED', active: true, ...audit(ownerId) },
        { id: pD, orgId, name: 'D', skill: 'DRIVER', active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values({ id: crewA, orgId, siteId: siteA, supervisorUserId: supId, name: 'Crew A', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([{ orgId, crewId: crewA, personId: pW }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `ao-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `asm-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accAId, orgId, name: 'Acc A', username: `aaa-${accAId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: accBId, orgId, name: 'Acc B', username: `aab-${accBId.slice(-8)}`, role: 'ACCOUNTANT', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: supId, orgId, name: 'Sup', username: `asu-${supId.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: driverId, orgId, name: 'Drv', username: `adr-${driverId.slice(-8)}`, role: 'DRIVER', personId: pD, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Wkr', username: `awk-${workerId.slice(-8)}`, role: 'WORKER', personId: pW, assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values([
        { id: vehicleA, orgId, vehicleTypeId: vtypeId, regNo: 'AUD-A1', assignedSiteId: siteA, assignedDriverPersonId: pD, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
        { id: vehicleB, orgId, vehicleTypeId: vtypeId, regNo: 'AUD-B1', assignedSiteId: siteB, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
      ]);
      await tx.insert(schema.materials).values([
        { id: matCement, orgId, name: 'Cement', uom: 'BAG', config: { supervisorLogs: true, driverPicks: false, driverViewOnly: false }, ...audit(ownerId) },
        { id: matSand, orgId, name: 'Sand', uom: 'CFT', config: { supervisorLogs: true, driverPicks: true, driverViewOnly: false }, ...audit(ownerId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications, schema.complaints, schema.vehicleReminders, schema.vehicleDocuments,
        schema.fuelIssuances, schema.fuelStockPurchases, schema.fuelLogs, schema.materialTxns, schema.materials,
        schema.approvalRequests, schema.cashTransfers, schema.expenses, schema.crewMembers, schema.crews,
        schema.vehicles, schema.vehicleTypes, schema.users, schema.people, schema.sites,
      ]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.delete(t).where(eq((t as any).orgId, orgId));
      }
      await tx.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
    });
    await dbs.onModuleDestroy();
  }, 120_000);

  // ---- vehicle document vault: SM + Owner ONLY ----
  it('vehicle docs are INVISIBLE to accountant / supervisor / driver / worker; SM sealed to his site', async () => {
    const docId = uuidv7();
    const created = await docs.createDoc(SM_A(), vehicleA, {
      id: docId, vehicleId: vehicleA, kind: 'INSURANCE', title: 'Policy 123', expiryDate: '2027-01-01',
    });
    expect(created.id).toBe(docId);

    for (const caller of [ACC_A(), SUP(), DRIVER(), WORKER()]) {
      await expect(docs.listDocs(caller, vehicleA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(docs.listReminders(caller, vehicleA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    // SM cannot reach another site's vehicle vault; the Owner can.
    await expect(docs.listDocs(SM_A(), vehicleB)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ownerSees = await docs.listDocs(OWNER(), vehicleA);
    expect(ownerSees.some((d) => d.id === docId)).toBe(true);
    // Expiry doc auto-created its linked EXPIRY reminder.
    const reminders = await docs.listReminders(SM_A(), vehicleA);
    expect(reminders.some((r) => r.documentId === docId && r.kind === 'EXPIRY')).toBe(true);
  });

  // ---- complaint box: OWNER-target privacy ----
  it('an OWNER-target complaint never reaches the SM; SM-target reaches SM and Owner; SM cannot resolve private ones', async () => {
    const privateId = uuidv7();
    await complaints.create(WORKER(), { id: privateId, target: 'OWNER', text: 'private grievance' });
    const smTargetId = uuidv7();
    await complaints.create(DRIVER(), { id: smTargetId, target: 'SITE_MANAGER', text: 'site problem' });

    const smSees = await complaints.list(SM_A());
    expect(smSees.find((c) => c.id === privateId)).toBeUndefined();
    expect(smSees.find((c) => c.id === smTargetId)).toBeDefined();

    const ownerSees = await complaints.list(OWNER());
    expect(ownerSees.find((c) => c.id === privateId)).toBeDefined();
    expect(ownerSees.find((c) => c.id === smTargetId)).toBeDefined();

    // The raiser sees his own; another field role does not.
    const workerSees = await complaints.list(WORKER());
    expect(workerSees.find((c) => c.id === privateId)).toBeDefined();
    const supSees = await complaints.list(SUP());
    expect(supSees.find((c) => c.id === privateId)).toBeUndefined();

    await expect(complaints.resolve(SM_A(), privateId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const resolved = await complaints.resolve(OWNER(), privateId);
    expect(resolved.status).toBe('RESOLVED');
  });

  // ---- accountant queue: role gate + per-site sealing ----
  // NOTE: not a deadlock — AccountantService.queue() fans out 3 concurrent round trips per call
  // (Promise.all of a scoped tx + fuel.matchFlags + cash.myBalance) and this test drives SIX
  // sequential queue() calls against live Neon (us-east-1, high RTT from India — see
  // docs/perf/techBuilder-Performance-Report.md). Isolated it completes in ~43s; back-to-back
  // with the file's other DB-heavy tests it can cross the global 60s testTimeout. Give it real
  // headroom rather than racing the default.
  it(
    'the queue is accountant/owner-only and per-site sealed',
    async () => {
      // seed one unverified SM expense on site A
      const expId = uuidv7();
      await records.createExpense(SM_A(), { id: expId, siteId: siteA, category: 'MISC', amountPaise: 70_000, businessDate: TODAY });

      for (const caller of [SUP(), DRIVER(), WORKER(), SM_A()]) {
        await expect(accountant.queue(caller)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
      const qa = await accountant.queue(ACC_A());
      expect(qa.unverifiedExpenses.some((e) => e.id === expId)).toBe(true);
      const qb = await accountant.queue(ACC_B());
      expect(qb.unverifiedExpenses.some((e) => e.id === expId)).toBe(false); // other desk, other site
    },
    120_000,
  );

  // ---- insights: accountant gets NOTHING aggregated ----
  it('the accountant is FORBIDDEN from insights (SM/Owner only)', async () => {
    await expect(insights.getDayInsights(ACC_A(), siteA, TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---- materials: per-type entry rules ----
  it('driver picks are data-only and allowed only for driverPicks types; supervisor entries are FINAL', async () => {
    // Driver picking a NON-driverPicks type (cement) → FORBIDDEN.
    await expect(
      records.createMaterialTxn(DRIVER(), { id: uuidv7(), type: 'IN', materialId: matCement, qty: 5, uom: 'BAG', siteId: siteA, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Driver picking sand (driverPicks=true) → stored as a data-only pick.
    const pickId = uuidv7();
    const pick = await records.createMaterialTxn(DRIVER(), { id: pickId, type: 'IN', materialId: matSand, qty: 2, uom: 'CFT', siteId: siteA, businessDate: TODAY });
    expect(pick.enteredRole).toBe('DRIVER');
    expect(pick.finalized).toBe(false);

    // Supervisor entry is the FINAL record.
    const finalId = uuidv7();
    const fin = await records.createMaterialTxn(SUP(), { id: finalId, type: 'IN', materialId: matSand, qty: 2, uom: 'CFT', siteId: siteA, businessDate: TODAY });
    expect(fin.enteredRole).toBe('SUPERVISOR');
    expect(fin.finalized).toBe(true);
  });

  // ---- diesel: the two-sided match, E2E ----
  it('issue 40 L → driver logs 40 L → CONFIRMED (quiet); 40 vs 30 → MISMATCH flag for accountant/SM/owner', async () => {
    // Supervisor stocks up, then issues 40 L to vehicle A.
    await fuel.createPurchase(SUP(), { id: uuidv7(), siteId: siteA, litres: 500, businessDate: TODAY });
    const iss1 = await fuel.createIssuance(SUP(), { id: uuidv7(), vehicleId: vehicleA, litres: 40, businessDate: TODAY });
    expect(iss1.status).toBe('PENDING');

    // Driver logs the received side with the SAME litres → both sides CONFIRM.
    const log1 = await records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleA, amountPaise: 400_000, litres: 40, reading: 1200, businessDate: TODAY });
    expect(log1.status).toBe('CONFIRMED');
    expect(log1.matchedIssuanceId).toBe(iss1.id);

    // Second round: issue 40, driver logs 30 → MISMATCH pair.
    const iss2 = await fuel.createIssuance(SUP(), { id: uuidv7(), vehicleId: vehicleA, litres: 40, businessDate: TODAY });
    const log2 = await records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleA, amountPaise: 300_000, litres: 30, reading: 1250, businessDate: TODAY });
    expect(log2.status).toBe('MISMATCH');

    // The 🚩 list shows exactly the mismatch pair (confirmed pair stays quiet) — for all three watchers.
    for (const watcher of [ACC_A(), SM_A(), OWNER()]) {
      const flags = await fuel.matchFlags(watcher);
      const mine = flags.filter((f) => f.vehicleId === vehicleA && f.businessDate === TODAY);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ issuedLitres: 40, receivedLitres: 30, status: 'MISMATCH', issuanceId: iss2.id });
    }
    // …and NOT for the other site's accountant, nor for field roles at all.
    const otherDesk = await fuel.matchFlags(ACC_B());
    expect(otherDesk.filter((f) => f.vehicleId === vehicleA)).toHaveLength(0);
    await expect(fuel.matchFlags(SUP())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(fuel.matchFlags(DRIVER())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
