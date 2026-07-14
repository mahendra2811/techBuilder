import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreatePersonInput, Person, UpdatePersonInput } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';
import { forbidScope, inSet, loadScope } from '../common/scope.util';

@Injectable()
export class PeopleService {
  constructor(private readonly dbs: DbService) {}

  async create(p: Principal, input: CreatePersonInput): Promise<Person> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const [row] = await tx
        .insert(schema.people)
        .values({
          id: input.id,
          orgId: p.orgId,
          name: input.name,
          phone: input.phone ?? null,
          skill: input.skill ?? null,
          defaultWagePaise: input.defaultWagePaise ?? null,
          active: true,
          createdBy: p.userId,
          updatedBy: p.userId,
          // Round 2 (C6): onboarder (SM/Supervisor/Owner — whoever holds `user.create`) sets
          // these once at creation; later edits are locked down to SM/Owner in update() below.
          guardianName: input.guardianName ?? null,
          guardianPhone: input.guardianPhone ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx.select().from(schema.people).where(eq(schema.people.id, input.id));
        if (existing) return mapPerson(existing);
        throw new ApiException('CONFLICT', 'Could not create person');
      }
      return mapPerson(row);
    });
  }

  /**
   * Round 2 (C6/CW-4): edit an existing person.
   * - `guardianName` / `guardianPhone` / `phone` are ID-card-tier fields: only the OWNER, or a
   *   SITE_MANAGER with this person inside their own reach (`ctx.crewPersonIds` — people carry
   *   no siteId directly, so crew membership at the SM's sites is the linkage), may change them.
   *   Any other caller (a Supervisor who created the person included) gets those 3 fields
   *   silently stripped from the patch — the rest of the patch (if any) still applies.
   * - Other fields (name/skill/defaultWagePaise) follow the existing people-edit convention:
   *   the person's original creator, an in-reach SM, or the Owner may change them.
   */
  async update(p: Principal, id: string, input: UpdatePersonInput): Promise<Person> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);

      const [existing] = await tx
        .select()
        .from(schema.people)
        .where(and(eq(schema.people.id, id), isNull(schema.people.deletedAt)));
      if (!existing) throw new ApiException('NOT_FOUND', 'Person not found');

      const smInReach = ctx.role === 'SITE_MANAGER' && ctx.crewPersonIds.includes(id);
      const canEditIdCardFields = ctx.role === 'OWNER' || smInReach;
      const canEditBasicFields = canEditIdCardFields || existing.createdBy === p.userId;

      if (!canEditBasicFields) forbidScope('Not permitted to edit this person');

      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.skill !== undefined) set.skill = input.skill;
      if (input.defaultWagePaise !== undefined) set.defaultWagePaise = input.defaultWagePaise;
      if (canEditIdCardFields) {
        if (input.phone !== undefined) set.phone = input.phone;
        if (input.guardianName !== undefined) set.guardianName = input.guardianName;
        if (input.guardianPhone !== undefined) set.guardianPhone = input.guardianPhone;
      }
      // else: phone / guardianName / guardianPhone silently dropped from the patch above.

      if (Object.keys(set).length === 0) return mapPerson(existing); // nothing left to apply

      set.updatedBy = p.userId;
      set.updatedAt = new Date();
      set.version = sql`${schema.people.version} + 1`;

      const [row] = await tx.update(schema.people).set(set as never).where(eq(schema.people.id, id)).returning();
      if (!row) throw new ApiException('CONFLICT', 'Could not update person');
      return mapPerson(row);
    });
  }

  async list(p: Principal): Promise<Person[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      // WP-1: Owner + SM see the org labour master (allocation needs the full list);
      // TH sees own crew; Driver/Worker see only their own person row.
      let scope: SQL | undefined;
      if (ctx.role === 'SUPERVISOR') scope = inSet(schema.people.id, ctx.crewPersonIds);
      else if (ctx.role === 'DRIVER' || ctx.role === 'WORKER') {
        scope = ctx.personId ? (eq(schema.people.id, ctx.personId) as SQL) : sql`false`;
      }
      const rows = await tx
        .select()
        .from(schema.people)
        .where(and(isNull(schema.people.deletedAt), scope))
        .orderBy(desc(schema.people.createdAt));
      return rows.map(mapPerson);
    });
  }
}

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
