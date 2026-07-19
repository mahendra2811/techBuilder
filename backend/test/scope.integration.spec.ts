/**
 * WP-1..WP-4 ACCEPTANCE (hardening punchlist) — runs against the LIVE DB in backend/.env
 * through the real DbService (RLS-enforced app role) and the real services. One test per
 * verified hole from the second-opinion review.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { AttendanceService } from '../src/attendance/attendance.service';
import { RecordsService } from '../src/records/records.service';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { WageService } from '../src/wage/wage.service';
import { DashboardsService } from '../src/dashboards/dashboards.service';
import { SyncService } from '../src/sync/sync.service';
import { PeopleService } from '../src/people/people.service';
import { businessDateNow, addDays } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA1 = uuidv7();
const vtypeId = uuidv7();
const vehicleV1 = uuidv7(); // assigned to the driver
const vehicleV2 = uuidv7(); // NOT assigned to the driver
const pW1 = uuidv7(); // crew member + worker's person
const pW2 = uuidv7(); // crew member
const pD = uuidv7(); // driver's person
const pOutside = uuidv7(); // person outside the crew
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const thId = uuidv7();
const driverId = uuidv7();
const workerId = uuidv7();
const expSiteA = uuidv7();
const expSiteB = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const SM_B = () => principal(smBId, 'SITE_MANAGER');
const TH = () => principal(thId, 'SUPERVISOR');
const DRIVER = () => principal(driverId, 'DRIVER');
const WORKER = () => principal(workerId, 'WORKER');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('scope enforcement acceptance (live DB, RLS app role)', () => {
  let dbs: DbService;
  let attendance: AttendanceService;
  let records: RecordsService;
  let approvals: ApprovalsService;
  let wage: WageService;
  let dashboards: DashboardsService;
  let sync: SyncService;
  let people: PeopleService;

  beforeAll(async () => {
    dbs = new DbService();
    attendance = new AttendanceService(dbs);
    records = new RecordsService(dbs);
    approvals = new ApprovalsService(dbs);
    wage = new WageService(dbs);
    dashboards = new DashboardsService(dbs);
    sync = new SyncService(dbs);
    people = new PeopleService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'ScopeTest Co', primaryColor: '#111111' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'] },
      records: { enabled: ['progress', 'expense', 'fuel', 'attendance'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'ScopeTest Co', code: `scopetest-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Site A', code: 'A', siteManagerId: smAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Site B', code: 'B', siteManagerId: smBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        // frozen.12: people carry a siteId — siteA crew/driver vs siteB "outside" person.
        { id: pW1, orgId, siteId: siteA, name: 'Worker One', skill: 'UNSKILLED', defaultWagePaise: 50_000, active: true, ...audit(ownerId) },
        { id: pW2, orgId, siteId: siteA, name: 'Worker Two', skill: 'UNSKILLED', defaultWagePaise: 50_000, active: true, ...audit(ownerId) },
        { id: pD, orgId, siteId: siteA, name: 'Driver Person', skill: 'DRIVER', defaultWagePaise: 60_000, active: true, ...audit(ownerId) },
        { id: pOutside, orgId, siteId: siteB, name: 'Outside Person', skill: 'UNSKILLED', defaultWagePaise: 50_000, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values({ id: crewA1, orgId, siteId: siteA, supervisorUserId: thId, name: 'Crew A1', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([
        { orgId, crewId: crewA1, personId: pW1 },
        { orgId, crewId: crewA1, personId: pW2 },
      ]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `o-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'SM A', username: `sma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'SM B', username: `smb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: thId, orgId, name: 'TH', username: `th-${thId.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteA, crewId: crewA1, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: driverId, orgId, name: 'Driver', username: `d-${driverId.slice(-8)}`, role: 'DRIVER', personId: pD, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerId, orgId, name: 'Worker', username: `w-${workerId.slice(-8)}`, role: 'WORKER', personId: pW1, assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values([
        { id: vehicleV1, orgId, vehicleTypeId: vtypeId, regNo: 'TEST-V1', assignedSiteId: siteA, assignedDriverPersonId: pD, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
        { id: vehicleV2, orgId, vehicleTypeId: vtypeId, regNo: 'TEST-V2', assignedSiteId: siteA, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
      ]);
      await tx.insert(schema.expenses).values([
        { id: expSiteA, orgId, siteId: siteA, category: 'MISC', amountPaise: 10_000, businessDate: TODAY, enteredBy: smAId, void: false, ...audit(smAId) },
        { id: expSiteB, orgId, siteId: siteB, category: 'MISC', amountPaise: 20_000, businessDate: TODAY, enteredBy: smBId, void: false, ...audit(smBId) },
      ]);
      await tx.insert(schema.attendance).values([
        { id: uuidv7(), orgId, siteId: siteA, crewId: crewA1, personId: pW1, businessDate: TODAY, status: 'PRESENT', otHours: 0, markedBy: smAId, ...audit(smAId) },
        { id: uuidv7(), orgId, siteId: siteB, personId: pOutside, businessDate: TODAY, status: 'PRESENT', otHours: 0, markedBy: smBId, ...audit(smBId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.approvalRequests,
        schema.fuelLogs,
        schema.attendance,
        schema.expenses,
        schema.progressNotes,
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

  // ---- Hole 1: WORKER org-wide reads ----
  it('WORKER cannot read other people’s expenses (self-scoped, not org-wide)', async () => {
    const rows = await records.listRecords(WORKER(), 'expense', undefined, addDays(TODAY, -7), TODAY);
    expect(rows).toHaveLength(0); // expenses exist (smA/smB) but none entered by the worker
  });

  it('WORKER is denied the org dashboard', async () => {
    await expect(dashboards.getOwnerDashboard(WORKER(), { from: addDays(TODAY, -7), to: TODAY })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('WORKER sees only their own attendance rows', async () => {
    const rows = await attendance.list(WORKER(), siteA, addDays(TODAY, -7), TODAY);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.personId === pW1)).toBe(true);
  });

  // ---- Hole 2: SITE_MANAGER org-wide reads ----
  it('SM(A) sees only site A expenses — site B is invisible', async () => {
    const rows = (await records.listRecords(SM_A(), 'expense', undefined, addDays(TODAY, -7), TODAY)) as Array<{ siteId: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.siteId === siteA)).toBe(true);
  });

  it('SM(A) wage summary covers only site A attendance', async () => {
    const summary = await wage.getWageSummary(SM_A(), { from: addDays(TODAY, -7), to: TODAY });
    expect(summary.rows.length).toBeGreaterThan(0);
    expect(summary.rows.every((r) => r.siteId === siteA)).toBe(true);
  });

  it('SM(A) cannot list attendance for site B', async () => {
    await expect(attendance.list(SM_A(), siteB, addDays(TODAY, -7), TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SM(A) dashboard completeness is limited to site A', async () => {
    const dash = await dashboards.getOwnerDashboard(SM_A(), { from: addDays(TODAY, -2), to: TODAY });
    expect(dash.completeness.every((c) => c.scopeId === siteA)).toBe(true);
  });

  // ---- frozen.12: labour master (/people) is site-scoped — sites are fully independent ----
  it('SM(A) sees only site A people — the site B person (incl. any driver) is invisible', async () => {
    const rows = await people.list(SM_A());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.siteId === siteA)).toBe(true);
    expect(rows.some((r) => r.id === pOutside)).toBe(false); // the site B person never appears
    expect(rows.some((r) => r.id === pD)).toBe(true); // site A driver's person does
  });

  it('OWNER still sees the whole org labour master (cross-site allocation)', async () => {
    const rows = await people.list(OWNER());
    expect(rows.some((r) => r.id === pOutside)).toBe(true);
    expect(rows.some((r) => r.id === pW1)).toBe(true);
  });

  // ---- Round 2: attendance is OUT of the app for the SUPERVISOR (matrix dropped attendance.mark) ----
  it('SUPERVISOR cannot mark attendance at all (Round 2 — attendance removed for the role)', async () => {
    await expect(
      attendance.mark(TH(), { siteId: siteA, crewId: crewA1, businessDate: TODAY, rows: [{ id: uuidv7(), personId: pW2, status: 'PRESENT' }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SM still cannot mark attendance at another site (dormant module keeps its scope)', async () => {
    await expect(
      attendance.mark(SM_A(), { siteId: siteB, businessDate: TODAY, rows: [{ id: uuidv7(), personId: pW1, status: 'PRESENT' }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SM marks own-site attendance successfully (module dormant in UI, intact in API)', async () => {
    const out = await attendance.mark(SM_A(), {
      siteId: siteA,
      crewId: crewA1,
      businessDate: TODAY,
      rows: [{ id: uuidv7(), personId: pW2, status: 'PRESENT' }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.markedBy).toBe(smAId);
  });

  // ---- Hole 4 (WP-2): self-approval + decide scope ----
  it('self-approval is rejected; wrong-site SM is rejected; own SM decides; re-decide conflicts', async () => {
    const reqId = uuidv7();
    await approvals.submitRequest(TH(), { id: reqId, type: 'LEAVE', payload: { personId: pW1 } });

    await expect(approvals.decideRequest(TH(), reqId, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(approvals.decideRequest(SM_B(), reqId, { approve: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const decided = await approvals.decideRequest(SM_A(), reqId, { approve: true });
    expect(decided.status).toBe('APPROVED');
    expect(decided.approverUserId).toBe(smAId);

    await expect(approvals.decideRequest(OWNER(), reqId, { approve: false })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  // ---- Hole 5: DRIVER on any vehicle ----
  it('DRIVER cannot log fuel on a vehicle not assigned to them', async () => {
    await expect(
      records.createFuelLog(DRIVER(), { id: uuidv7(), vehicleId: vehicleV2, amountPaise: 5_000, litres: 5, reading: 100, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('DRIVER logs fuel on their own vehicle; fuel list shows only their vehicle', async () => {
    const log = await records.createFuelLog(DRIVER(), {
      id: uuidv7(),
      vehicleId: vehicleV1,
      amountPaise: 5_000,
      litres: 5,
      reading: 100,
      businessDate: TODAY,
    });
    expect(log.vehicleId).toBe(vehicleV1);
    const rows = (await records.listRecords(DRIVER(), 'fuel', undefined, addDays(TODAY, -7), TODAY)) as Array<{ vehicleId: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.vehicleId === vehicleV1)).toBe(true);
  });

  // ---- WP-3: edit/void ownership + window ----
  it('creator edits own same-day expense; non-creator TH is rejected', async () => {
    const id = uuidv7();
    await records.createExpense(SM_A(), { id, siteId: siteA, category: 'MISC', amountPaise: 1_000, businessDate: TODAY });
    await expect(records.updateRecord(SM_A(), 'expense', id, { amountPaise: 1_500 })).resolves.toBeUndefined();
    await expect(records.voidRecord(TH(), 'expense', id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('edit window closes at business-day +1 for the creator; Owner override still works', async () => {
    const staleId = uuidv7();
    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.expenses).values({
        id: staleId,
        orgId,
        siteId: siteA,
        category: 'MISC',
        amountPaise: 3_000,
        businessDate: addDays(TODAY, -3),
        enteredBy: smAId,
        void: false,
        ...audit(smAId),
      });
    });
    await expect(records.updateRecord(SM_A(), 'expense', staleId, { amountPaise: 3_500 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(records.updateRecord(OWNER(), 'expense', staleId, { amountPaise: 3_500 })).resolves.toBeUndefined();
  });

  // ---- WP-4: attendance backdating windows (Round 2: supervisor can't mark at all) ----
  it('SM: 3 days OK, 10 days rejected · Owner: 10 days OK · future rejected', async () => {
    const mark = (p: Principal, businessDate: string) =>
      attendance.mark(p, { siteId: siteA, crewId: crewA1, businessDate, rows: [{ id: uuidv7(), personId: pW1, status: 'PRESENT' }] });

    await expect(mark(SM_A(), addDays(TODAY, -3))).resolves.toBeDefined();
    await expect(mark(SM_A(), addDays(TODAY, -10))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(mark(OWNER(), addDays(TODAY, -10))).resolves.toBeDefined();
    await expect(mark(SM_A(), addDays(TODAY, 1))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('corrections bump version (the Excel corrected-flag source)', async () => {
    const id = uuidv7();
    const first = await attendance.mark(SM_A(), { siteId: siteA, businessDate: addDays(TODAY, -2), rows: [{ id, personId: pW2, status: 'PRESENT' }] });
    expect(first[0]!.version).toBe(1);
    const corrected = await attendance.mark(SM_A(), { siteId: siteA, businessDate: addDays(TODAY, -2), rows: [{ id: uuidv7(), personId: pW2, status: 'HALF_DAY' }] });
    expect(corrected[0]!.version).toBeGreaterThan(1);
    expect(corrected[0]!.status).toBe('HALF_DAY');
  });

  // ---- Phase 4 → frozen.10: record-CREATION backdating windows ----
  // SUP-9 (aligned to the web 2026-07-19): the SUPERVISOR never books an expense directly (request-only,
  // any amount → OVER_DIRECT_LIMIT). SM keeps the 7-day window; the driver's fuel log is today-ONLY.
  it('record creation obeys the rules: SUPERVISOR expense request-only, SM ≤7d, driver fuel today-only', async () => {
    const mkExpense = (p: Principal, businessDate: string) =>
      records.createExpense(p, { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 500, businessDate });

    // Supervisor is refused regardless of date/amount — spends are accountant-decided requests.
    await expect(mkExpense(TH(), TODAY)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
    await expect(mkExpense(SM_A(), addDays(TODAY, -5))).resolves.toBeDefined();
    await expect(mkExpense(SM_A(), addDays(TODAY, -10))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(mkExpense(SM_A(), addDays(TODAY, 1))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const mkFuel = (businessDate: string) =>
      records.createFuelLog(DRIVER(), {
        id: uuidv7(),
        vehicleId: vehicleV1,
        amountPaise: 100,
        litres: 1,
        reading: 200,
        businessDate,
      });
    await expect(mkFuel(TODAY)).resolves.toBeDefined();
    await expect(mkFuel(addDays(TODAY, -1))).rejects.toMatchObject({ code: 'FORBIDDEN' }); // DRV-4: today only
  });

  it('sync CREATE events obey the same record rules (SM window; supervisor expense blocked outright)', async () => {
    const results = await sync.pushBatch(SM_A(), [
      {
        outboxId: 'ob-p4',
        entityType: 'expense',
        op: 'CREATE',
        payload: { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 100, businessDate: addDays(TODAY, -10), void: false },
      },
    ]);
    expect(results[0]).toMatchObject({ ok: false, errorCode: 'FORBIDDEN' });

    // SUP-9: a supervisor's sync expense is refused outright (request-only, same as the REST path).
    const supResults = await sync.pushBatch(TH(), [
      {
        outboxId: 'ob-p4b',
        entityType: 'expense',
        op: 'CREATE',
        payload: { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 3_000_000, businessDate: TODAY, void: false },
      },
    ]);
    expect(supResults[0]).toMatchObject({ ok: false, errorCode: 'VALIDATION_FAILED' });
  });

  // ---- Sync bypass closed ----
  it('sync.pushBatch no longer accepts master-data writes and enforces action + scope', async () => {
    const results = await sync.pushBatch(WORKER(), [
      { outboxId: 'ob-1', entityType: 'site', op: 'CREATE', payload: { id: uuidv7(), name: 'Evil Site', code: 'EV' } },
      { outboxId: 'ob-2', entityType: 'expense', op: 'CREATE', payload: { id: uuidv7(), siteId: siteA, category: 'MISC', amountPaise: 1, businessDate: TODAY } },
    ]);
    expect(results[0]).toMatchObject({ ok: false, errorCode: 'NOT_FOUND' }); // site not in the outbox registry anymore
    expect(results[1]).toMatchObject({ ok: false, errorCode: 'FORBIDDEN' }); // worker lacks record.enter

    // Round 2: the supervisor lost attendance.mark — the SM is the remaining (dormant) writer.
    const good = await sync.pushBatch(SM_A(), [
      {
        outboxId: 'ob-3',
        entityType: 'attendance',
        op: 'CREATE',
        payload: { id: uuidv7(), siteId: siteA, crewId: crewA1, personId: pW1, businessDate: TODAY, status: 'PRESENT', otHours: 0 },
      },
    ]);
    expect(good[0]).toMatchObject({ ok: true });
  });

  // ---- RLS regression (org isolation still holds) ----
  it('cross-tenant isolation: another org context sees none of this org’s rows', async () => {
    const strangerOrg = uuidv7();
    const rows = await dbs.runInTenant(strangerOrg, (tx) => tx.select().from(schema.expenses));
    expect(rows).toHaveLength(0);
  });
});
