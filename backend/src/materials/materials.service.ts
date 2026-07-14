import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { MaterialTypeConfigSchema } from '@techbuilder/contracts';
import type { CreateMaterialInput, Material, UpdateMaterialInput } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, loadScope } from '../common/scope.util';

/**
 * Round 2 (CW-8) — the materials CATALOG. The SM/Owner defines 10-20 material
 * TYPES once, each carrying a `MaterialTypeConfig` (shared/src/config.ts) that
 * drives who may enter transactions for it: `records.service.createMaterialTxn`
 * reads `config.driverPicks` to decide whether a DRIVER's pick is allowed.
 *
 * Mirrors the `sites/` reference pattern. Create/update have no dedicated
 * ACTIONS entry — like `SitesService.updateConfig` (WO-8), the route carries
 * no @RequireAction and this service enforces SITE_MANAGER/OWNER fresh from
 * the DB (never trusts the JWT role).
 */
@Injectable()
export class MaterialsService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreateMaterialInput): Promise<Material> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot manage the materials catalog`);
      }
      const [row] = await tx
        .insert(schema.materials)
        .values({
          id: input.id,
          orgId: p.orgId,
          name: input.name,
          uom: input.uom,
          config: input.config ?? null,
          createdBy: p.userId,
          updatedBy: p.userId,
        })
        .onConflictDoNothing() // idempotent on client UUIDv7
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.materials).where(eq(schema.materials.id, input.id));
        if (existing) return mapMaterial(existing);
        throw new ApiException('CONFLICT', 'Could not create material');
      }
      return mapMaterial(row);
    });
  }

  // Any authenticated role may read the catalog — supervisors/drivers need it for their
  // material pickers (list is org-wide, there is no per-site material catalog).
  async list(p: Principal): Promise<Material[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.materials)
        .where(isNull(schema.materials.deletedAt))
        .orderBy(asc(schema.materials.name));
      return rows.map(mapMaterial);
    });
  }

  async update(p: Principal, id: string, input: UpdateMaterialInput): Promise<Material> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      if (ctx.role !== 'OWNER' && ctx.role !== 'SITE_MANAGER') {
        forbidScope(`Role ${ctx.role} cannot manage the materials catalog`);
      }
      const [existing] = await tx
        .select({ id: schema.materials.id })
        .from(schema.materials)
        .where(and(eq(schema.materials.id, id), isNull(schema.materials.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Material not found');

      const set: Record<string, unknown> = {
        updatedBy: p.userId,
        updatedAt: new Date(),
        version: sql`${schema.materials.version} + 1`,
      };
      if (input.name !== undefined) set.name = input.name;
      if (input.config !== undefined) set.config = input.config;

      const [row] = await tx
        .update(schema.materials)
        .set(set as never)
        .where(eq(schema.materials.id, id))
        .returning();
      if (!row) throw new ApiException('NOT_FOUND', 'Material not found');
      return mapMaterial(row);
    });
  }
}

function mapMaterial(r: typeof schema.materials.$inferSelect): Material {
  const parsed = MaterialTypeConfigSchema.safeParse(r.config);
  return {
    id: r.id,
    orgId: r.orgId,
    name: r.name,
    uom: r.uom,
    config: parsed.success ? parsed.data : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy ?? r.id,
    updatedBy: r.updatedBy ?? r.id,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    version: r.version,
  };
}
