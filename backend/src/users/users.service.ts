import { Injectable } from '@nestjs/common';
import { desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateUserInput, Role, User } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import { hashPassword } from '../auth/password';
import type { Principal } from '../common/current-user.decorator';

/** Cascade: each role may only create roles "below" it (Owner→SM→TH). */
const CAN_CREATE: Record<Role, Role[]> = {
  OWNER: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'],
  SITE_MANAGER: ['TEAM_HEAD', 'DRIVER', 'WORKER'],
  TEAM_HEAD: ['WORKER', 'DRIVER'],
  DRIVER: [],
  WORKER: [],
};

@Injectable()
export class UsersService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateUserInput): Promise<User> {
    if (!CAN_CREATE[p.role].includes(input.role)) {
      throw new ApiException('FORBIDDEN', `${p.role} cannot create role ${input.role}`);
    }
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [dupe] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, input.username));
      if (dupe) throw new ApiException('DUPLICATE', 'Username already exists', { username: 'taken' });

      const [row] = await tx
        .insert(schema.users)
        .values({
          id: input.id,
          orgId: p.orgId,
          personId: input.personId ?? null,
          name: input.name,
          username: input.username,
          phone: input.phone ?? null,
          role: input.role,
          passwordHash: await hashPassword(input.tempPassword),
          mustChangePassword: true,
          assignedSiteId: input.assignedSiteId ?? null,
          crewId: input.crewId ?? null,
          allowedVehicleTypeIds: input.allowedVehicleTypeIds ?? null,
          emergencyContact: input.emergencyContact ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.users).where(eq(schema.users.id, input.id));
        if (existing) return mapUser(existing);
        throw new ApiException('CONFLICT', 'Could not create user');
      }
      return mapUser(row);
    });
  }

  async list(p: Principal): Promise<User[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.users)
        .where(isNull(schema.users.deletedAt))
        .orderBy(desc(schema.users.createdAt));
      return rows.map(mapUser);
    });
  }

  async deactivate(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      await tx
        .update(schema.users)
        .set({ active: false, updatedBy: p.userId, updatedAt: new Date() })
        .where(eq(schema.users.id, id));
    });
  }
}

function mapUser(u: typeof schema.users.$inferSelect): User {
  return {
    id: u.id,
    orgId: u.orgId,
    personId: u.personId,
    name: u.name,
    username: u.username,
    phone: u.phone,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    assignedSiteId: u.assignedSiteId,
    crewId: u.crewId,
    allowedVehicleTypeIds: u.allowedVehicleTypeIds ?? [],
    emergencyContact: u.emergencyContact,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    createdBy: u.createdBy ?? u.id,
    updatedBy: u.updatedBy ?? u.id,
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
    version: u.version,
  };
}
