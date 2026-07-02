import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateUserInput, Role, User } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import { hashPassword } from '../auth/password';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';

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
      // WP-1: creators place new users INSIDE their own scope — an SM attaches to their own
      // site, a TH to their own crew (Owner is free).
      const ctx = await loadScope(tx, p);
      if (ctx.role === 'SITE_MANAGER') {
        if (!input.assignedSiteId || !ctx.siteIds.includes(input.assignedSiteId)) {
          forbidScope('Site managers may only create users assigned to their own site');
        }
      } else if (ctx.role === 'TEAM_HEAD') {
        if (!input.crewId || !ctx.crewIds.includes(input.crewId)) {
          forbidScope('Team heads may only create users attached to their own crew');
        }
      }
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
      const ctx = await loadScope(tx, p);
      // WP-1: Owner sees all; SM their site's users; TH their crew's users; others only self.
      let scope: SQL | undefined;
      if (ctx.role === 'SITE_MANAGER') {
        scope = or(eq(schema.users.id, ctx.userId), inSet(schema.users.assignedSiteId, ctx.siteIds)) as SQL;
      } else if (ctx.role === 'TEAM_HEAD') {
        scope = or(eq(schema.users.id, ctx.userId), inSet(schema.users.crewId, ctx.crewIds)) as SQL;
      } else if (ctx.role !== 'OWNER') {
        scope = eq(schema.users.id, ctx.userId) as SQL;
      }
      const rows = await tx
        .select()
        .from(schema.users)
        .where(and(isNull(schema.users.deletedAt), scope))
        .orderBy(desc(schema.users.createdAt));
      return rows.map(mapUser);
    });
  }

  async deactivate(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const [target] = await tx.select().from(schema.users).where(eq(schema.users.id, id));
      if (!target) throw new ApiException('NOT_FOUND', 'User not found');
      // WP-1: only roles you may create may you deactivate, and only inside your scope.
      if (ctx.role !== 'OWNER') {
        if (!CAN_CREATE[ctx.role].includes(target.role)) {
          forbidScope(`${ctx.role} cannot deactivate role ${target.role}`);
        }
        const inScope =
          ctx.role === 'SITE_MANAGER'
            ? !!target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId)
            : ctx.role === 'TEAM_HEAD'
              ? !!target.crewId && ctx.crewIds.includes(target.crewId)
              : false;
        if (!inScope) forbidScope('User is outside your scope');
      }
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
