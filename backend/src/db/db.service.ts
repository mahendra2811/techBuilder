import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { TENANT_TABLES } from '@techbuilder/contracts/db/schema';
import { loadEnv } from '../config/env';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Drizzle + Postgres. The crown-jewel method is `runInTenant`: it opens a transaction and
 * sets `app.org_id` PER-TRANSACTION via set_config(...,true) so RLS isolates the tenant.
 * Pooled connections reuse sockets → tenant context MUST be transaction-scoped, never session-scoped.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db: Db;

  constructor() {
    const env = loadEnv();
    this.pool = new Pool({ connectionString: env.DATABASE_URL });
    this.db = drizzle(this.pool, { schema });
  }

  /** Run `fn` inside a transaction scoped to `orgId`; RLS enforces isolation for every query in it. */
  async runInTenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
      return fn(tx);
    });
  }

  /** Non-tenant escape hatch — ONLY for auth lookup via the SECURITY DEFINER function. */
  get raw(): Db {
    return this.db;
  }

  /**
   * Boot-time guardrail: verify EVERY tenant table has FORCE ROW LEVEL SECURITY + a
   * `tenant_isolation` policy. RLS is applied by `db:rls` as a step SEPARATE from migrations, so a
   * migration that adds a table before someone re-runs db:rls would ship that table with NO
   * isolation at all (cross-tenant read/write). This catches exactly that: throws in production
   * (fail closed — never serve traffic with a hole), warns loudly elsewhere so local dev without
   * db:rls still starts.
   */
  async assertRlsEnforced(): Promise<void> {
    const logger = new Logger('DbService');
    const tables = [...TENANT_TABLES] as string[];
    const rows = (
      await this.db.execute(sql`
        SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ANY(${tables})
          AND (
            NOT c.relforcerowsecurity
            OR NOT EXISTS (
              SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
            )
          )
      `)
    ).rows as Array<{ name: string }>;
    if (rows.length === 0) return;
    const missing = rows.map((r) => r.name).join(', ');
    const msg = `RLS NOT enforced on: ${missing}. Run \`npm run db:rls\` (or \`db:deploy\`) before serving traffic.`;
    if (loadEnv().NODE_ENV === 'production') throw new Error(msg);
    logger.warn(msg);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
