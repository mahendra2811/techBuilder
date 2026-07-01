import { Injectable } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateVehicleInput, Vehicle } from '@techbuilder/contracts';
import type { VehicleDoc } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class VehiclesService {
  constructor(private readonly dbs: DbService) {}

  async create(u: Principal, input: CreateVehicleInput): Promise<Vehicle> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
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
      const rows = await tx
        .select()
        .from(schema.vehicles)
        .where(isNull(schema.vehicles.deletedAt))
        .orderBy(desc(schema.vehicles.createdAt));
      return rows.map(mapVehicle);
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
