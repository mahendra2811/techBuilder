import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateVehicleInput, Vehicle, VehicleSnapshot } from '@techbuilder/contracts';
import type { VehicleDoc } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';

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
      // WP-1: Owner sees all; SM their site's fleet; Driver their assigned vehicle(s);
      // TH/Worker have no vehicle scope → empty list.
      let scope: SQL | undefined;
      if (ctx.role === 'SITE_MANAGER') scope = inSet(schema.vehicles.assignedSiteId, ctx.siteIds);
      else if (ctx.role === 'DRIVER') scope = inSet(schema.vehicles.id, ctx.vehicleIds);
      else if (ctx.role !== 'OWNER') scope = sql`false`;
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
