import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, isNull, or, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateUserInput,
  DriverDetail,
  Expense,
  FuelLog,
  Person,
  Role,
  Trip,
  User,
  Vehicle,
  VehicleLog,
} from '@techbuilder/contracts';
import type { VehicleDoc } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import { hashPassword } from '../auth/password';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';
import { addDays, businessDateNow } from '../common/business-date';
import { loadEodCutoff } from '../common/org-config.util';

/** Cascade: each role may only create roles "below" it (Owner→SM→Supervisor). */
const CAN_CREATE: Record<Role, Role[]> = {
  OWNER: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER', 'ACCOUNTANT'],
  SITE_MANAGER: ['SUPERVISOR', 'DRIVER', 'WORKER'],
  SUPERVISOR: ['WORKER', 'DRIVER'],
  DRIVER: [],
  WORKER: [],
  ACCOUNTANT: [], // TODO(Round-2 CW-2/CW-3): revisit
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
      } else if (ctx.role === 'SUPERVISOR') {
        if (!input.crewId || !ctx.crewIds.includes(input.crewId)) {
          forbidScope('Supervisors may only create users attached to their own crew');
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
      // WP-1: Owner sees all; SM their site's users; Supervisor their crew's users; others only self.
      // Round 2: the ACCOUNTANT reads his sites' directory too (name resolution + ledger recipients).
      let scope: SQL | undefined;
      if (ctx.role === 'SITE_MANAGER' || ctx.role === 'ACCOUNTANT') {
        scope = or(eq(schema.users.id, ctx.userId), inSet(schema.users.assignedSiteId, ctx.siteIds)) as SQL;
      } else if (ctx.role === 'SUPERVISOR') {
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
      // Client-plan v1 (T-5): a Supervisor may CREATE people but never deactivate —
      // removing a person is Site-Manager-and-above only.
      if (ctx.role === 'SUPERVISOR') {
        forbidScope('Supervisors cannot deactivate people — ask your Site Manager');
      }
      const [target] = await tx.select().from(schema.users).where(eq(schema.users.id, id));
      if (!target) throw new ApiException('NOT_FOUND', 'User not found');
      // WP-1: only roles you may create may you deactivate, and only inside your scope.
      if (ctx.role !== 'OWNER') {
        if (!CAN_CREATE[ctx.role].includes(target.role)) {
          forbidScope(`${ctx.role} cannot deactivate role ${target.role}`);
        }
        // SUPERVISOR was rejected above (T-5) — only SITE_MANAGER reaches this scope check.
        const inScope =
          ctx.role === 'SITE_MANAGER' && !!target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId);
        if (!inScope) forbidScope('User is outside your scope');
      }
      await tx
        .update(schema.users)
        .set({ active: false, updatedBy: p.userId, updatedAt: new Date() })
        .where(eq(schema.users.id, id));
    });
  }

  /** WO-8 (wave 2) — the mirror of deactivate(): Owner only (reactivating is a trust decision
   * a Site Manager should not make unilaterally, unlike deactivate which any creator-role may do). */
  async activate(p: Principal, id: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER') forbidScope('Only the Owner may reactivate a user');
      const [target] = await tx.select().from(schema.users).where(eq(schema.users.id, id));
      if (!target || target.deletedAt) throw new ApiException('NOT_FOUND', 'User not found');
      await tx
        .update(schema.users)
        .set({ active: true, updatedBy: p.userId, updatedAt: new Date() })
        .where(eq(schema.users.id, id));
    });
  }

  /**
   * WO-9 (wave 2) — admin password reset. Scope mirrors deactivate() (Owner: anyone;
   * Site Manager: only roles they may create, inside their own site scope; Supervisor:
   * forbidden), plus never yourself (use POST /auth/change-password for that). Forces
   * `mustChangePassword` and revokes every refresh token the target holds — old sessions
   * on other devices die immediately, matching the intent of a forced credential reset.
   */
  async resetPassword(p: Principal, id: string, newPassword: string): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      if (id === p.userId) forbidScope('Use /auth/change-password to change your own password');
      const ctx = await loadScope(tx, p);
      if (ctx.role === 'SUPERVISOR') forbidScope('Supervisors cannot reset passwords — ask your Site Manager');
      const [target] = await tx.select().from(schema.users).where(eq(schema.users.id, id));
      if (!target || target.deletedAt) throw new ApiException('NOT_FOUND', 'User not found');
      if (ctx.role !== 'OWNER') {
        if (!CAN_CREATE[ctx.role].includes(target.role)) {
          forbidScope(`${ctx.role} cannot reset the password of role ${target.role}`);
        }
        const inScope =
          ctx.role === 'SITE_MANAGER' && !!target.assignedSiteId && ctx.siteIds.includes(target.assignedSiteId);
        if (!inScope) forbidScope('User is outside your scope');
      }
      await tx
        .update(schema.users)
        .set({
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: true,
          updatedBy: p.userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, id));
      await tx.update(schema.refreshTokens).set({ revokedAt: new Date() }).where(eq(schema.refreshTokens.userId, id));
    });
  }

  /**
   * WO-12 — driver drill-down (SM own-site / OWNER any, mirrors VehiclesService.detail).
   * A driver has no `assignedSiteId` of their own — site membership for an SM's scope check is
   * derived the same way loadScope derives a DRIVER's siteIds: via their currently-assigned
   * vehicle's site (falling back to the user row's assignedSiteId if ever set).
   */
  async driverDetail(p: Principal, targetUserId: string): Promise<DriverDetail> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot view driver details`);
      }
      const [userRow] = await tx
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.id, targetUserId), isNull(schema.users.deletedAt)));
      if (!userRow) throw new ApiException('NOT_FOUND', 'User not found');
      if (userRow.role !== 'DRIVER') {
        throw new ApiException('VALIDATION_FAILED', 'User is not a driver');
      }

      let vehicleRow: typeof schema.vehicles.$inferSelect | undefined;
      if (userRow.personId) {
        [vehicleRow] = await tx
          .select()
          .from(schema.vehicles)
          .where(and(eq(schema.vehicles.assignedDriverPersonId, userRow.personId), isNull(schema.vehicles.deletedAt)));
      }

      if (ctx.role === 'SITE_MANAGER') {
        let inScope = !!userRow.assignedSiteId && ctx.siteIds.includes(userRow.assignedSiteId);
        if (!inScope && vehicleRow?.assignedSiteId) inScope = ctx.siteIds.includes(vehicleRow.assignedSiteId);
        if (!inScope) forbidScope('Driver is outside your scope');
      }

      let personRow: typeof schema.people.$inferSelect | undefined;
      if (userRow.personId) {
        [personRow] = await tx.select().from(schema.people).where(eq(schema.people.id, userRow.personId));
      }

      const today = businessDateNow(new Date(), await loadEodCutoff(tx));
      const from90 = addDays(today, -89);

      const logs = vehicleRow
        ? await tx
            .select()
            .from(schema.vehicleLogs)
            .where(
              and(
                eq(schema.vehicleLogs.vehicleId, vehicleRow.id),
                isNull(schema.vehicleLogs.deletedAt),
                gte(schema.vehicleLogs.businessDate, from90),
              ),
            )
            .orderBy(desc(schema.vehicleLogs.businessDate))
        : [];
      const fuel = vehicleRow
        ? await tx
            .select()
            .from(schema.fuelLogs)
            .where(
              and(
                eq(schema.fuelLogs.vehicleId, vehicleRow.id),
                isNull(schema.fuelLogs.deletedAt),
                gte(schema.fuelLogs.businessDate, from90),
              ),
            )
            .orderBy(desc(schema.fuelLogs.businessDate))
        : [];
      const trips = vehicleRow
        ? await tx
            .select()
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.vehicleId, vehicleRow.id),
                isNull(schema.trips.deletedAt),
                gte(schema.trips.businessDate, from90),
              ),
            )
            .orderBy(desc(schema.trips.businessDate))
        : [];
      const expenses = await tx
        .select()
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.enteredBy, targetUserId),
            isNull(schema.expenses.deletedAt),
            gte(schema.expenses.businessDate, from90),
          ),
        )
        .orderBy(desc(schema.expenses.businessDate));

      return {
        user: mapUser(userRow),
        person: personRow ? mapPerson(personRow) : null,
        vehicle: vehicleRow ? mapVehicle(vehicleRow) : null,
        logs: logs.map(mapVehicleLog),
        fuel: fuel.map(mapFuelLog),
        trips: trips.map(mapTrip),
        expenses: expenses.map(mapExpense),
      };
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

// ---- WO-12 driver-detail mappers (mirror the local mapXxx in their owning modules) ----

function mapPerson(r: typeof schema.people.$inferSelect): Person {
  return {
    id: r.id,
    orgId: r.orgId,
    name: r.name,
    phone: r.phone ?? null,
    skill: r.skill ?? null,
    defaultWagePaise: r.defaultWagePaise ?? null,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
    // frozen.8 (Round-2 guardian/ID-card fields) — plain passthrough; no create/edit UI yet.
    guardianName: r.guardianName ?? null,
    guardianPhone: r.guardianPhone ?? null,
  };
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
    amountPaise: r.amountPaise ?? 0,
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

function mapExpense(r: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: r.id,
    orgId: r.orgId,
    siteId: r.siteId,
    category: r.category,
    amountPaise: r.amountPaise ?? 0,
    vendorId: r.vendorId ?? null,
    billNo: r.billNo ?? null,
    paidVia: r.paidVia,
    remark: r.remark ?? null,
    receiptMediaId: r.receiptMediaId ?? null,
    businessDate: r.businessDate,
    enteredBy: r.enteredBy,
    void: r.void,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
    // frozen.8 (Round-2 two-tick rule) — plain passthrough, no verification workflow wired yet.
    verifiedBy: r.verifiedBy ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    flagged: r.flagged,
    flagNote: r.flagNote ?? null,
  };
}
