import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreateSiteInput, Site } from '@techbuilder/contracts';
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
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    createdBy: s.createdBy ?? s.id,
    updatedBy: s.updatedBy ?? s.id,
    deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
    version: s.version,
  };
}
