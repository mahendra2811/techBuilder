import { Injectable } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateVehicleTypeInput, VehicleType } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

@Injectable()
export class VehicleTypesService {
  constructor(private readonly dbs: DbService) {}

  async create(u: Principal, input: CreateVehicleTypeInput): Promise<VehicleType> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.vehicleTypes)
        .values({
          id: input.id,
          orgId: u.orgId,
          name: input.name,
          trackingMode: input.trackingMode,
          fieldsSchema: input.fieldsSchema ?? [],
          createdBy: u.userId,
          updatedBy: u.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(schema.vehicleTypes)
          .where(eq(schema.vehicleTypes.id, input.id));
        if (existing) return mapVehicleType(existing);
        throw new ApiException('CONFLICT', 'Could not create vehicle type');
      }
      return mapVehicleType(row);
    });
  }

  async list(u: Principal): Promise<VehicleType[]> {
    return this.dbs.runInTenant(u.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.vehicleTypes)
        .where(isNull(schema.vehicleTypes.deletedAt))
        .orderBy(desc(schema.vehicleTypes.createdAt));
      return rows.map(mapVehicleType);
    });
  }
}

function mapVehicleType(r: typeof schema.vehicleTypes.$inferSelect): VehicleType {
  return {
    id: r.id,
    orgId: r.orgId,
    name: r.name,
    trackingMode: r.trackingMode,
    fieldsSchema: (r.fieldsSchema as VehicleType['fieldsSchema']) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
