import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  CreateSiteInput,
  EmergencyContact,
  Site,
  SiteExpenseFormConfig,
  UpdateSiteConfigInput,
  UpdateSiteInput,
} from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';

/** Reference module: the tenant+scope+CRUD pattern every resource module follows. */
@Injectable()
export class SitesService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateSiteInput): Promise<Site> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.sites)
        .values({
          id: input.id,
          orgId: p.orgId,
          name: input.name,
          code: input.code,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          status: input.status ?? 'ACTIVE',
          weeklyOff: input.weeklyOff ?? null,
          startDate: input.startDate ?? null,
          expectedEndDate: input.expectedEndDate ?? null,
          budgetPaise: input.budgetPaise ?? null,
          siteManagerId: input.siteManagerId ?? null,
          accountantId: input.accountantId ?? null, // Round 2: per-site accountant
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.sites).where(eq(schema.sites.id, input.id));
        if (existing) return mapSite(existing);
        throw new ApiException('CONFLICT', 'Could not create site');
      }
      return mapSite(row);
    });
  }

  async list(p: Principal): Promise<Site[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      // WP-1: everyone below Owner sees only the sites in their scope
      // (SM: assigned+managed; TH: crew sites; Driver: own vehicles' sites; Worker: assigned).
      const scope = ctx.role === 'OWNER' ? undefined : inSet(schema.sites.id, ctx.siteIds);
      const rows = await tx
        .select()
        .from(schema.sites)
        .where(and(isNull(schema.sites.deletedAt), scope))
        .orderBy(desc(schema.sites.createdAt));
      return rows.map(mapSite);
    });
  }

  async get(p: Principal, id: string): Promise<Site> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && !ctx.siteIds.includes(id)) forbidScope('Site out of scope');
      const [row] = await tx.select().from(schema.sites).where(and(eq(schema.sites.id, id), isNull(schema.sites.deletedAt)));
      if (!row) throw new ApiException('NOT_FOUND', 'Site not found');
      return mapSite(row);
    });
  }

  /**
   * WO-8: narrow per-site config update — NOT the full `site.manage` action.
   * OWNER: any site, all fields. SITE_MANAGER: ONLY his own site (managed or
   * assigned, per loadScope), and never `smDirectLimitPaise` (that threshold is
   * "one level above" him — Owner-edited only). `emergencyContacts` and
   * `expenseFormConfig` are wholesale replaces when provided (screen always
   * sends the complete object).
   */
  async updateConfig(p: Principal, id: string, input: UpdateSiteConfigInput): Promise<Site> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot edit site config`);
      }
      if (ctx.role === 'SITE_MANAGER') {
        if (!ctx.siteIds.includes(id)) forbidScope('Site out of scope');
        if (input.expenseFormConfig?.smDirectLimitPaise !== undefined) {
          throw new ApiException('FORBIDDEN', 'your limit is set by the Owner');
        }
      }

      const [existing] = await tx
        .select({ id: schema.sites.id, expenseFormConfig: schema.sites.expenseFormConfig })
        .from(schema.sites)
        .where(and(eq(schema.sites.id, id), isNull(schema.sites.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Site not found');

      const set: Record<string, unknown> = {
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${schema.sites.version} + 1`,
      };
      if (input.emergencyContacts !== undefined) set.emergencyContacts = input.emergencyContacts;
      if (input.expenseFormConfig !== undefined) {
        // An SM save can never carry smDirectLimitPaise (rejected above) — but it must also not
        // WIPE an Owner-set override via the wholesale replace. Carry the existing value forward.
        const prior = existing.expenseFormConfig as SiteExpenseFormConfig | null;
        const next = { ...input.expenseFormConfig };
        if (ctx.role === 'SITE_MANAGER' && prior?.smDirectLimitPaise !== undefined) {
          next.smDirectLimitPaise = prior.smDirectLimitPaise;
        }
        set.expenseFormConfig = next;
      }

      const [row] = await tx
        .update(schema.sites)
        .set(set as never)
        .where(eq(schema.sites.id, id))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Site not found');
      return mapSite(row);
    });
  }

  /**
   * Round 2 (frozen.8) — Owner-only role assignments: the site's SM and its per-site
   * ACCOUNTANT. Validates the target user exists, is active and carries the right role.
   * Explicit null clears an assignment.
   */
  async update(p: Principal, id: string, input: UpdateSiteInput): Promise<Site> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER') forbidScope('Only the Owner assigns site roles');

      const set: Record<string, unknown> = {
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${schema.sites.version} + 1`,
      };
      const assertRole = async (userId: string, role: 'SITE_MANAGER' | 'ACCOUNTANT') => {
        const [u] = await tx
          .select({ role: schema.users.role, active: schema.users.active, deletedAt: schema.users.deletedAt })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        if (!u || u.deletedAt || !u.active) throw new ApiException('NOT_FOUND', 'User not found or inactive');
        if (u.role !== role) {
          throw new ApiException('VALIDATION_FAILED', `User is not a ${role}`, { userId: 'wrong role' });
        }
      };
      if (input.siteManagerId !== undefined) {
        if (input.siteManagerId) await assertRole(input.siteManagerId, 'SITE_MANAGER');
        set.siteManagerId = input.siteManagerId;
      }
      if (input.accountantId !== undefined) {
        if (input.accountantId) await assertRole(input.accountantId, 'ACCOUNTANT');
        set.accountantId = input.accountantId;
      }

      const [row] = await tx
        .update(schema.sites)
        .set(set as never)
        .where(and(eq(schema.sites.id, id), isNull(schema.sites.deletedAt)))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Site not found');
      return mapSite(row);
    });
  }
}

function mapSite(s: typeof schema.sites.$inferSelect): Site {
  return {
    id: s.id,
    orgId: s.orgId,
    name: s.name,
    code: s.code,
    lat: s.lat,
    lng: s.lng,
    status: s.status,
    weeklyOff: s.weeklyOff ?? [],
    startDate: s.startDate,
    expectedEndDate: s.expectedEndDate,
    budgetPaise: s.budgetPaise,
    siteManagerId: s.siteManagerId,
    // frozen.8 (Round-2 accountant per-site assignment) — plain passthrough; no assignment
    // UI/endpoint wired yet (that's the accountant WO, CW-2).
    accountantId: s.accountantId ?? null,
    emergencyContacts: (s.emergencyContacts as EmergencyContact[] | null) ?? [],
    expenseFormConfig: (s.expenseFormConfig as SiteExpenseFormConfig | null) ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    createdBy: s.createdBy ?? s.id,
    updatedBy: s.updatedBy ?? s.id,
    deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
    version: s.version,
  };
}
