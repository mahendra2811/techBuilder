import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateVehicleInput,
  FuelLog,
  Issue,
  Trip,
  Vehicle,
  VehicleAnalytics,
  VehicleDetail,
  VehicleLog,
  VehicleSnapshot,
} from '@techbuilder/contracts';
import type { VehicleDoc } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { addDays, businessDateNow } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';

@Injectable()
export class VehiclesService {
  constructor(private readonly dbs: DbService) {}

  async create(u: Principal, input: CreateVehicleInput): Promise<Vehicle> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
      const ctx = await loadScope(tx, u);
      // WP-1: an SM may only add vehicles to their own site (Owner: anywhere).
      if (ctx.role === 'SITE_MANAGER') {
        if (!input.assignedSiteId || !ctx.siteIds.includes(input.assignedSiteId)) {
          forbidScope('Site managers may only add vehicles assigned to their own site');
        }
      }
      const [row] = await tx
        .insert(schema.vehicles)
        .values({
          id: input.id,
          orgId: u.orgId,
          vehicleTypeId: input.vehicleTypeId,
          regNo: input.regNo,
          name: input.name ?? null,
          values: input.values ?? {},
          assignedSiteId: input.assignedSiteId ?? null,
          assignedDriverPersonId: input.assignedDriverPersonId ?? null,
          status: input.status ?? 'IDLE',
          docs: input.docs ?? [],
          createdBy: u.userId,
          updatedBy: u.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.id, input.id));
        if (existing) return mapVehicle(existing);
        throw new ApiException('CONFLICT', 'Could not create vehicle');
      }
      return mapVehicle(row);
    });
  }

  async list(u: Principal): Promise<Vehicle[]> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
      const ctx = await loadScope(tx, u);
      // WP-1: Owner sees all; SM their site's fleet; TH/Worker have no vehicle scope → empty list.
      // WO-11: Driver scope widened from "own vehicle only" to their own SITE's fleet (still
      // site-scoped, not org-wide — same shape as SITE_MANAGER) so the self-switch screen can
      // list other vehicles at the site to switch onto. `ctx.siteIds` for a DRIVER is derived
      // from their currently assigned vehicle(s) (loadScope) — a driver with none assigned sees
      // an empty list here, same as they already do on the vehicle-log entry screens.
      let scope: SQL | undefined;
      // Round 2: SUPERVISOR sees his crew-drivers' site fleet; ACCOUNTANT his sites' fleet
      // (regNo resolution for diesel flags) — both site-shaped like the SM.
      if (
        ctx.role === 'SITE_MANAGER' ||
        ctx.role === 'DRIVER' ||
        ctx.role === 'SUPERVISOR' ||
        ctx.role === 'ACCOUNTANT'
      ) {
        scope = inSet(schema.vehicles.assignedSiteId, ctx.siteIds);
      } else if (ctx.role !== 'OWNER') scope = sql`false`;
      const rows = await tx
        .select()
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.deletedAt), scope))
        .orderBy(desc(schema.vehicles.createdAt));
      return rows.map(mapVehicle);
    });
  }

  /**
   * WO-7 — driver dashboard vehicle card: the caller's own assigned vehicle,
   * the last two vehicle_logs (to derive current vs. yesterday's reading),
   * and any PENDING vehicle-switch request they've raised.
   * Only DRIVER populates `ctx.vehicleIds` in loadScope — any other role (or
   * a driver with no assigned vehicle) gets NOT_FOUND; the web renders that
   * as an empty state, never a hard error.
   */
  async mySnapshot(u: Principal): Promise<VehicleSnapshot> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
      const ctx = await loadScope(tx, u);
      const vehicleId = ctx.vehicleIds[0];
      if (!vehicleId) {
        throw new ApiException('NOT_FOUND', 'No vehicle is assigned to you');
      }
      const [vehicleRow] = await tx
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.deletedAt)));
      if (!vehicleRow) {
        throw new ApiException('NOT_FOUND', 'No vehicle is assigned to you');
      }

      // Last two logs ordered by business date — businessDate is unique per
      // (org, vehicle, day) so this is deterministic without a createdAt tiebreak.
      const logs = await tx
        .select()
        .from(schema.vehicleLogs)
        .where(and(eq(schema.vehicleLogs.vehicleId, vehicleId), isNull(schema.vehicleLogs.deletedAt)))
        .orderBy(desc(schema.vehicleLogs.businessDate))
        .limit(2);
      const [latest, prior] = logs;
      const currentReading = latest ? (latest.endReading ?? latest.startReading) : null;
      const previousReading = prior ? (prior.endReading ?? prior.startReading) : null;

      const [pending] = await tx
        .select({ id: schema.approvalRequests.id })
        .from(schema.approvalRequests)
        .where(
          and(
            eq(schema.approvalRequests.type, 'VEHICLE_SWITCH'),
            eq(schema.approvalRequests.status, 'PENDING'),
            eq(schema.approvalRequests.requestedBy, u.userId),
            isNull(schema.approvalRequests.deletedAt),
          ),
        )
        .orderBy(desc(schema.approvalRequests.createdAt));

      return {
        vehicle: mapVehicle(vehicleRow),
        currentReading,
        previousReading,
        pendingSwitchRequestId: pending?.id ?? null,
      };
    });
  }

  /**
   * WO-11 — driver self-switch: a driver may move themselves onto another vehicle of the
   * SAME org (RLS/tenant-scoped — no extra site-scope restriction, kept deliberately simple
   * per the WO) as long as it is not under MAINTENANCE and its vehicle TYPE is one they are
   * allowed to drive. "Allowed" is the UNION of `users.allowedVehicleTypeIds` and
   * `driver_allowed_types` rows — both mechanisms coexist in this schema. Outside that list,
   * the driver must fall back to the existing VEHICLE_SWITCH approval-request flow (message
   * below points the web UI at it).
   */
  async selfSwitch(p: Principal, targetVehicleId: string): Promise<Vehicle> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'DRIVER' || !ctx.personId) {
        forbidScope('Only a driver with a linked person record may switch vehicles');
      }
      const personId = ctx.personId;

      const [target] = await tx
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.id, targetVehicleId), isNull(schema.vehicles.deletedAt)));
      if (!target) throw new ApiException('NOT_FOUND', 'Vehicle not found');
      if (target.status === 'MAINTENANCE') {
        throw new ApiException('VALIDATION_FAILED', 'Vehicle is under maintenance and cannot be switched into');
      }

      const [userRow] = await tx
        .select({ allowedVehicleTypeIds: schema.users.allowedVehicleTypeIds })
        .from(schema.users)
        .where(eq(schema.users.id, p.userId));
      const viaColumn = userRow?.allowedVehicleTypeIds ?? [];
      const viaTable = await tx
        .select({ vehicleTypeId: schema.driverAllowedTypes.vehicleTypeId })
        .from(schema.driverAllowedTypes)
        .where(eq(schema.driverAllowedTypes.userId, p.userId));
      const allowed = new Set<string>([...viaColumn, ...viaTable.map((r) => r.vehicleTypeId)]);
      if (!allowed.has(target.vehicleTypeId)) {
        throw new ApiException(
          'FORBIDDEN',
          'Vehicle type not in your allowed list — submit a vehicle-change request',
        );
      }

      // Clear the driver off any other vehicle(s) currently pointing at them, then assign the target.
      const previous = await tx
        .select({ id: schema.vehicles.id, regNo: schema.vehicles.regNo })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.assignedDriverPersonId, personId),
            isNull(schema.vehicles.deletedAt),
            ne(schema.vehicles.id, target.id),
          ),
        );
      if (previous.length) {
        await tx
          .update(schema.vehicles)
          .set({
            assignedDriverPersonId: null,
            updatedBy: p.userId,
            updatedAt: new Date(),
            version: sql`${schema.vehicles.version} + 1`,
          })
          .where(
            inArray(
              schema.vehicles.id,
              previous.map((v) => v.id),
            ),
          );
      }

      const [updated] = await tx
        .update(schema.vehicles)
        .set({
          assignedDriverPersonId: personId,
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.vehicles.version} + 1`,
        })
        .where(eq(schema.vehicles.id, target.id))
        .returning();
      if (!updated) throw new ApiException('CONFLICT', 'Could not switch vehicle');

      // Best-effort: tell the target vehicle's site manager (no SM assigned → no notification).
      if (updated.assignedSiteId) {
        const [site] = await tx
          .select({ sm: schema.sites.siteManagerId })
          .from(schema.sites)
          .where(and(eq(schema.sites.id, updated.assignedSiteId), isNull(schema.sites.deletedAt)));
        if (site?.sm) {
          await tx.insert(schema.notifications).values({
            id: uuidv7(),
            orgId: p.orgId,
            userId: site.sm,
            type: 'ASSIGNMENT_CHANGED',
            payload: {
              driverUserId: p.userId,
              fromVehicleId: previous[0]?.id ?? null,
              toVehicleId: updated.id,
              fromRegNo: previous[0]?.regNo ?? null,
              toRegNo: updated.regNo,
            },
          });
        }
      }

      // Round 2 (CW-9): the SUPERVISOR now heads workers AND drivers — widen the notification
      // to the driver's crew supervisor too (no crew / no supervisor / self-switch-by-supervisor
      // → skip, same best-effort shape as the SM notification above).
      const [driverUser] = await tx
        .select({ crewId: schema.users.crewId })
        .from(schema.users)
        .where(eq(schema.users.id, p.userId));
      if (driverUser?.crewId) {
        const [crew] = await tx
          .select({ supervisorUserId: schema.crews.supervisorUserId })
          .from(schema.crews)
          .where(and(eq(schema.crews.id, driverUser.crewId), isNull(schema.crews.deletedAt)));
        if (crew?.supervisorUserId && crew.supervisorUserId !== p.userId) {
          await tx.insert(schema.notifications).values({
            id: uuidv7(),
            orgId: p.orgId,
            userId: crew.supervisorUserId,
            type: 'ASSIGNMENT_CHANGED',
            payload: {
              driverUserId: p.userId,
              fromVehicleId: previous[0]?.id ?? null,
              toVehicleId: updated.id,
              fromRegNo: previous[0]?.regNo ?? null,
              toRegNo: updated.regNo,
            },
          });
        }
      }

      return mapVehicle(updated);
    });
  }

  /**
   * frozen.10 (SUP-7/D5) — direct driver↔vehicle allotment: the SUPERVISOR re-allots vehicles
   * among HIS crew drivers (log-only, auto-approved — no request); SM (own site) and OWNER may
   * use it too. Notifies the vehicle's SM + the displaced and newly-assigned drivers.
   */
  async assignDriver(p: Principal, vehicleId: string, driverPersonId: string): Promise<Vehicle> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER' && ctx.role !== 'SUPERVISOR') {
        forbidScope(`Role ${ctx.role} cannot allot vehicles`);
      }

      const [target] = await tx
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.deletedAt)));
      if (!target) throw new ApiException('NOT_FOUND', 'Vehicle not found');
      if (target.status === 'MAINTENANCE') {
        throw new ApiException('VALIDATION_FAILED', 'Vehicle is under maintenance');
      }

      // Vehicle scope: SM = own site; SUPERVISOR = crew-driver vehicles or his own site's.
      if (ctx.role === 'SITE_MANAGER' && !(target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId))) {
        forbidScope('Vehicle is outside your site scope');
      }
      if (
        ctx.role === 'SUPERVISOR' &&
        !ctx.vehicleIds.includes(target.id) &&
        !(target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId))
      ) {
        forbidScope('Vehicle is outside your crew/site scope');
      }

      // Target driver: an active DRIVER login linked to this person; supervisors only within their crew.
      const [driverUser] = await tx
        .select({ id: schema.users.id, crewId: schema.users.crewId, active: schema.users.active })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.personId, driverPersonId),
            eq(schema.users.role, 'DRIVER'),
            isNull(schema.users.deletedAt),
          ),
        );
      if (!driverUser) throw new ApiException('NOT_FOUND', 'No driver login is linked to that person');
      if (!driverUser.active) {
        throw new ApiException('VALIDATION_FAILED', 'Driver is inactive', { driverPersonId: 'inactive' });
      }
      if (ctx.role === 'SUPERVISOR' && (!driverUser.crewId || !ctx.crewIds.includes(driverUser.crewId))) {
        forbidScope('That driver is not in your crew');
      }
      // frozen.12: sites are independent — an SM can only allot a driver who belongs to their OWN
      // site. (Previously only the VEHICLE's site was checked, so a Site-B manager could pull in a
      // Site-A driver surfaced by the old org-wide /people list.)
      if (ctx.role === 'SITE_MANAGER') {
        const [driverPerson] = await tx
          .select({ siteId: schema.people.siteId })
          .from(schema.people)
          .where(and(eq(schema.people.id, driverPersonId), isNull(schema.people.deletedAt)));
        if (!driverPerson?.siteId || !ctx.siteIds.includes(driverPerson.siteId)) {
          forbidScope('That driver belongs to another site');
        }
      }

      // Who is being displaced off this vehicle (for the notification)?
      const displacedPersonId = target.assignedDriverPersonId;

      // Clear the incoming driver off any other vehicle(s), then assign him here.
      const previous = await tx
        .select({ id: schema.vehicles.id, regNo: schema.vehicles.regNo })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.assignedDriverPersonId, driverPersonId),
            isNull(schema.vehicles.deletedAt),
            ne(schema.vehicles.id, target.id),
          ),
        );
      if (previous.length) {
        await tx
          .update(schema.vehicles)
          .set({
            assignedDriverPersonId: null,
            updatedBy: p.userId,
            updatedAt: new Date(),
            version: sql`${schema.vehicles.version} + 1`,
          })
          .where(inArray(schema.vehicles.id, previous.map((v) => v.id)));
      }

      const [updated] = await tx
        .update(schema.vehicles)
        .set({
          assignedDriverPersonId: driverPersonId,
          updatedBy: p.userId,
          updatedAt: new Date(),
          version: sql`${schema.vehicles.version} + 1`,
        })
        .where(eq(schema.vehicles.id, target.id))
        .returning();
      if (!updated) throw new ApiException('CONFLICT', 'Could not allot the vehicle');

      // Best-effort notifications: the vehicle's SM + the new driver + the displaced driver.
      const targets = new Set<string>();
      if (updated.assignedSiteId) {
        const [site] = await tx
          .select({ sm: schema.sites.siteManagerId })
          .from(schema.sites)
          .where(and(eq(schema.sites.id, updated.assignedSiteId), isNull(schema.sites.deletedAt)));
        if (site?.sm && site.sm !== p.userId) targets.add(site.sm);
      }
      targets.add(driverUser.id);
      if (displacedPersonId && displacedPersonId !== driverPersonId) {
        const [displaced] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.personId, displacedPersonId),
              eq(schema.users.role, 'DRIVER'),
              isNull(schema.users.deletedAt),
            ),
          );
        if (displaced) targets.add(displaced.id);
      }
      targets.delete(p.userId);
      if (targets.size) {
        await tx.insert(schema.notifications).values(
          [...targets].map((userId) => ({
            id: uuidv7(),
            orgId: p.orgId,
            userId,
            type: 'ASSIGNMENT_CHANGED' as const,
            payload: {
              allottedBy: p.userId,
              driverPersonId,
              vehicleId: updated.id,
              regNo: updated.regNo,
              fromVehicleId: previous[0]?.id ?? null,
              fromRegNo: previous[0]?.regNo ?? null,
            },
          })),
        );
      }

      return mapVehicle(updated);
    });
  }

  /**
   * WO-12 — fleet drill-down: SM (own site) / OWNER (any). Analytics are computed here (no
   * stored rollup table): per-day run = endReading−startReading over the last 90 days of
   * vehicle_logs, averaged over the 7/30/90-day sub-windows; fuel litres/paise over the last
   * 30 days; `totalExpensePaise` is ALL-TIME fuel spend (the `expenses` table has no
   * vehicleId column in this schema — true all-cost totals are a v2 gap, `expenses: []` here).
   */
  async detail(p: Principal, vehicleId: string): Promise<VehicleDetail> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot view vehicle details`);
      }
      const [vehicleRow] = await tx
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.deletedAt)));
      if (!vehicleRow) throw new ApiException('NOT_FOUND', 'Vehicle not found');
      if (ctx.role === 'SITE_MANAGER') {
        if (!vehicleRow.assignedSiteId || !ctx.siteIds.includes(vehicleRow.assignedSiteId)) {
          forbidScope('Vehicle out of scope');
        }
      }

      const today = businessDateNow(new Date(), await loadEodCutoff(tx));
      const from90 = addDays(today, -89);
      const from30 = addDays(today, -29);
      const from7 = addDays(today, -6);

      const logs = await tx
        .select()
        .from(schema.vehicleLogs)
        .where(
          and(
            eq(schema.vehicleLogs.vehicleId, vehicleId),
            isNull(schema.vehicleLogs.deletedAt),
            gte(schema.vehicleLogs.businessDate, from90),
          ),
        )
        .orderBy(desc(schema.vehicleLogs.businessDate));

      const fuel = await tx
        .select()
        .from(schema.fuelLogs)
        .where(
          and(
            eq(schema.fuelLogs.vehicleId, vehicleId),
            isNull(schema.fuelLogs.deletedAt),
            gte(schema.fuelLogs.businessDate, from90),
          ),
        )
        .orderBy(desc(schema.fuelLogs.businessDate));

      const trips = await tx
        .select()
        .from(schema.trips)
        .where(
          and(eq(schema.trips.vehicleId, vehicleId), isNull(schema.trips.deletedAt), gte(schema.trips.businessDate, from90)),
        )
        .orderBy(desc(schema.trips.businessDate));

      const damages = await tx
        .select()
        .from(schema.issues)
        .where(and(eq(schema.issues.vehicleId, vehicleId), isNull(schema.issues.deletedAt)))
        .orderBy(desc(schema.issues.createdAt));

      // All-time fuel spend (unbounded by the 90-day window above) → totalExpensePaise.
      const allFuel = await tx
        .select({ amountPaise: schema.fuelLogs.amountPaise })
        .from(schema.fuelLogs)
        .where(and(eq(schema.fuelLogs.vehicleId, vehicleId), isNull(schema.fuelLogs.deletedAt)));
      const totalExpensePaise = allFuel.reduce((sum, r) => sum + (r.amountPaise ?? 0), 0);

      const avgRunPerDay = (fromDate: string): number | null => {
        const runs = logs
          .filter((l) => l.businessDate >= fromDate && l.endReading != null)
          .map((l) => (l.endReading as number) - l.startReading);
        if (!runs.length) return null;
        return runs.reduce((a, b) => a + b, 0) / runs.length;
      };
      const fuel30 = fuel.filter((f) => f.businessDate >= from30);
      const fuelLitres30 = fuel30.reduce((sum, f) => sum + f.litres, 0);
      const fuelPaise30 = fuel30.reduce((sum, f) => sum + (f.amountPaise ?? 0), 0);

      const analytics: VehicleAnalytics = {
        vehicleId,
        avgRunPerDay7: avgRunPerDay(from7),
        avgRunPerDay30: avgRunPerDay(from30),
        avgRunPerDay90: avgRunPerDay(from90),
        fuelLitres30,
        fuelPaise30,
        monthlyCostPaise: fuelPaise30,
        totalExpensePaise,
      };

      return {
        vehicle: mapVehicle(vehicleRow),
        analytics,
        logs: logs.map(mapVehicleLog),
        fuel: fuel.map(mapFuelLog),
        expenses: [], // NOT LINKED: expenses has no vehicleId column in this schema (v1 gap — see report)
        trips: trips.map(mapTrip),
        damages: damages.map(mapIssue),
      };
    });
  }
}

function mapVehicle(r: typeof schema.vehicles.$inferSelect): Vehicle {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleTypeId: r.vehicleTypeId,
    regNo: r.regNo,
    name: r.name ?? null,
    values: (r.values as Record<string, unknown>) ?? {},
    assignedSiteId: r.assignedSiteId ?? null,
    assignedDriverPersonId: r.assignedDriverPersonId ?? null,
    status: r.status,
    docs: (r.docs as VehicleDoc[]) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

// ---- WO-12 drill-down mappers (mirror the local mapXxx in records.service.ts) ----

function mapVehicleLog(r: typeof schema.vehicleLogs.$inferSelect): VehicleLog {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    driverPersonId: r.driverPersonId,
    startReading: r.startReading,
    endReading: r.endReading ?? null,
    hoursWorked: r.hoursWorked ?? null,
    loadsCount: r.loadsCount ?? null,
    note: r.note ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapFuelLog(r: typeof schema.fuelLogs.$inferSelect): FuelLog {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    amountPaise: r.amountPaise ?? null,
    paidByDriver: r.paidByDriver,
    litres: r.litres,
    reading: r.reading,
    receiptMediaId: r.receiptMediaId ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
    // frozen.8 (Round-2 C7 diesel two-sided match) — plain passthrough, matching not wired yet.
    status: r.status,
    matchedIssuanceId: r.matchedIssuanceId ?? null,
  };
}

function mapTrip(r: typeof schema.trips.$inferSelect): Trip {
  return {
    id: r.id,
    orgId: r.orgId,
    vehicleId: r.vehicleId,
    fromText: r.fromText,
    toText: r.toText,
    purpose: r.purpose ?? null,
    materialTxnId: r.materialTxnId ?? null,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}

function mapIssue(r: typeof schema.issues.$inferSelect): Issue {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId ?? null,
    vehicleId: r.vehicleId ?? null,
    severity: r.severity,
    description: r.description,
    status: r.status,
    resolvedBy: r.resolvedBy ?? null,
    resolutionNote: r.resolutionNote ?? null,
    closingNote: r.closingNote ?? null,
    businessDate: r.businessDate,
    mediaIds: r.mediaIds ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
