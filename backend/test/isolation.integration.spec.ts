/**
 * WO-15 — the SEALED-BOX audit (client plan S-8 + T-5). RLS isolates the ORG only;
 * cross-SITE isolation rides entirely on per-request scope logic, so every NEW surface
 * from the client-plan build gets an explicit "SM of site A sees ZERO of site B" proof:
 * insights (day/period/person) · vendors (list/ledger) · vehicle detail · driver detail ·
 * issue resolve · site-config PATCH · the widened driver fleet list · TH deactivate (T-5).
 * Positive crew-slice check included (TH day view excludes non-crew entries).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { InsightsService } from '../src/insights/insights.service';
import { VendorsService } from '../src/vendors/vendors.service';
import { VehiclesService } from '../src/vehicles/vehicles.service';
import { UsersService } from '../src/users/users.service';
import { SitesService } from '../src/sites/sites.service';
import { RecordsService } from '../src/records/records.service';
import { businessDateNow, addDays } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

// ---- fixture ids (fresh org — torn down in afterAll) ----
const orgId = uuidv7();
const siteA = uuidv7();
const siteB = uuidv7();
const crewA = uuidv7();
const vtypeId = uuidv7();
const vehicleA = uuidv7();
const vehicleB = uuidv7();
const pWA = uuidv7(); // worker A's person (crew A)
const pWB = uuidv7(); // worker B's person (site B)
const pDA = uuidv7(); // driver A's person
const ownerId = uuidv7();
const smAId = uuidv7();
const smBId = uuidv7();
const thAId = uuidv7();
const driverAId = uuidv7();
const workerAId = uuidv7();
const workerBId = uuidv7();
const vendorBId = uuidv7(); // shop at site B
const issueBId = uuidv7(); // damage on site B's vehicle
const expBySmA = uuidv7(); // SM-A expense at site A (outside TH's crew slice)

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM_A = () => principal(smAId, 'SITE_MANAGER');
const TH_A = () => principal(thAId, 'TEAM_HEAD');
const DRIVER_A = () => principal(driverAId, 'DRIVER');

const TODAY = businessDateNow(new Date(), '20:00');
const WEEK_AGO = addDays(TODAY, -7);
const audit = (by: string) => ({ createdBy: by, updatedBy: by });

describe.skipIf(!HAS_DB)('WO-15 sealed-box isolation (live DB, RLS app role)', () => {
  let dbs: DbService;
  let insights: InsightsService;
  let vendors: VendorsService;
  let vehicles: VehiclesService;
  let users: UsersService;
  let sites: SitesService;
  let records: RecordsService;

  beforeAll(async () => {
    dbs = new DbService();
    insights = new InsightsService(dbs);
    vendors = new VendorsService(dbs);
    vehicles = new VehiclesService(dbs);
    users = new UsersService(dbs);
    sites = new SitesService(dbs);
    records = new RecordsService(dbs);

    const config = parseOrgConfig({
      brand: { name: 'IsoTest Co', primaryColor: '#333333' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] },
      records: { enabled: ['progress', 'expense', 'fuel'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'IsoTest Co', code: `isotest-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values([
        { id: siteA, orgId, name: 'Iso Site A', code: 'IA', siteManagerId: smAId, ...audit(ownerId) },
        { id: siteB, orgId, name: 'Iso Site B', code: 'IB', siteManagerId: smBId, ...audit(ownerId) },
      ]);
      await tx.insert(schema.people).values([
        { id: pWA, orgId, name: 'Iso Worker A', active: true, ...audit(ownerId) },
        { id: pWB, orgId, name: 'Iso Worker B', active: true, ...audit(ownerId) },
        { id: pDA, orgId, name: 'Iso Driver A', skill: 'DRIVER', active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.crews).values({ id: crewA, orgId, siteId: siteA, teamHeadUserId: thAId, name: 'Iso Crew A', ...audit(ownerId) });
      await tx.insert(schema.crewMembers).values([{ orgId, crewId: crewA, personId: pWA }]);
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Iso Owner', username: `io-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smAId, orgId, name: 'Iso SM A', username: `isma-${smAId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smBId, orgId, name: 'Iso SM B', username: `ismb-${smBId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: thAId, orgId, name: 'Iso TH A', username: `ith-${thAId.slice(-8)}`, role: 'TEAM_HEAD', assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: driverAId, orgId, name: 'Iso Driver A', username: `ida-${driverAId.slice(-8)}`, role: 'DRIVER', personId: pDA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerAId, orgId, name: 'Iso Worker A', username: `iwa-${workerAId.slice(-8)}`, role: 'WORKER', personId: pWA, assignedSiteId: siteA, crewId: crewA, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: workerBId, orgId, name: 'Iso Worker B', username: `iwb-${workerBId.slice(-8)}`, role: 'WORKER', personId: pWB, assignedSiteId: siteB, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vehicleTypes).values({ id: vtypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], ...audit(ownerId) });
      await tx.insert(schema.vehicles).values([
        { id: vehicleA, orgId, vehicleTypeId: vtypeId, regNo: 'ISO-A1', assignedSiteId: siteA, assignedDriverPersonId: pDA, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
        { id: vehicleB, orgId, vehicleTypeId: vtypeId, regNo: 'ISO-B1', assignedSiteId: siteB, status: 'ACTIVE', docs: [], values: {}, ...audit(ownerId) },
      ]);
      await tx.insert(schema.vendors).values({ id: vendorBId, orgId, siteId: siteB, name: 'Site B Shop', ...audit(smBId) });
      await tx.insert(schema.issues).values({ id: issueBId, orgId, siteId: siteB, vehicleId: vehicleB, severity: 'LOW', description: 'site B damage', status: 'OPEN', businessDate: TODAY, ...audit(smBId) });
      await tx.insert(schema.expenses).values({ id: expBySmA, orgId, siteId: siteA, category: 'MISC', amountPaise: 7_700, businessDate: TODAY, enteredBy: smAId, void: false, paidVia: 'CASH', ...audit(smAId) });
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [
        schema.notifications,
        schema.approvalRequests,
        schema.expenses,
        schema.issues,
        schema.vendorPayments,
        schema.vendors,
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

  // ---- insights ----
  it('SM(A) day/period insights for site B are FORBIDDEN', async () => {
    await expect(insights.getDayInsights(SM_A(), siteB, TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(insights.getPeriodInsights(SM_A(), siteB, WEEK_AGO, TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('SM(A) person-insights for a site-B worker is FORBIDDEN', async () => {
    await expect(insights.getPersonInsights(SM_A(), workerBId, WEEK_AGO, TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('TH(A) person-insights outside his crew is FORBIDDEN; his day view excludes non-crew entries', async () => {
    await expect(insights.getPersonInsights(TH_A(), workerBId, WEEK_AGO, TODAY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Positive crew-slice: SM-A's ₹77 expense at site A must NOT appear in the TH's crew-sliced day.
    const day = await insights.getDayInsights(TH_A(), siteA, TODAY);
    expect(day.expenses.some((e) => e.id === expBySmA)).toBe(false);
  });

  // ---- vendors (udhaar) ----
  it('SM(A) vendor list excludes site-B shops; site-B ledger is FORBIDDEN', async () => {
    const list = await vendors.list(SM_A());
    expect(list.some((v) => v.id === vendorBId)).toBe(false);
    await expect(vendors.ledger(SM_A(), vendorBId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---- fleet drill-downs ----
  it('SM(A) vehicle detail of a site-B vehicle is FORBIDDEN', async () => {
    await expect(vehicles.detail(SM_A(), vehicleB)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('DRIVER(A) fleet list is bounded to his own site (widened scope stays sealed)', async () => {
    const list = await vehicles.list(DRIVER_A());
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((v) => v.assignedSiteId === siteA)).toBe(true);
  });

  // ---- damage lifecycle ----
  it('SM(A) cannot resolve a site-B issue', async () => {
    await expect(records.resolveIssue(SM_A(), issueBId, { resolutionNote: 'nope' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ---- site config ----
  it('SM(A) cannot PATCH site-B config; and cannot set his own ₹1L limit anywhere', async () => {
    await expect(
      sites.updateConfig(SM_A(), siteB, { emergencyContacts: [{ kind: 'POLICE', label: 'PS', phone: '100' }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      sites.updateConfig(SM_A(), siteA, { expenseFormConfig: { smDirectLimitPaise: 99_999_999 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---- T-5: TH cannot deactivate ----
  it('TH(A) cannot deactivate anyone — not even his own crew worker (T-5)', async () => {
    await expect(users.deactivate(TH_A(), workerAId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---- owner sanity (the box has one key) ----
  it('OWNER sees across both boxes (sanity)', async () => {
    const day = await insights.getDayInsights(OWNER(), siteB, TODAY);
    expect(day.businessDate).toBe(TODAY);
    const det = await vehicles.detail(OWNER(), vehicleB);
    expect(det.vehicle.id).toBe(vehicleB);
  });
});
