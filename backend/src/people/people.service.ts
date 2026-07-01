import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import type { CreatePersonInput, Person } from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import type { Principal } from '../common/current-user.decorator';

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

  async list(p: Principal): Promise<Person[]> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.people)
        .where(isNull(schema.people.deletedAt))
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
  };
}
