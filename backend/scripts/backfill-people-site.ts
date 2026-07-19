/**
 * frozen.12 one-off backfill: set people.site_id for every existing person (added nullable in
 * migration 0006). Derives each person's site from their linkage, in priority order:
 *   1. their linked login's assigned_site_id
 *   2. their crew's site (crew_members → crews.site_id)
 *   3. (drivers) their assigned vehicle's site
 *   4. their creator's assigned_site_id (covers login-less labour created by an SM)
 * Only fills NULLs → idempotent + safe to re-run. Anyone with no derivable linkage stays NULL
 * (visible to the Owner only, which is the correct "unassigned" fallback).
 *
 * Run: DATABASE_URL_ADMIN=... (or DATABASE_URL=...) npx tsx scripts/backfill-people-site.ts
 */
import { Pool } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL(_ADMIN) is required');
  const pool = new Pool({ connectionString: url });
  try {
    const before = await pool.query(`SELECT count(*)::int AS n FROM people WHERE site_id IS NULL AND deleted_at IS NULL`);
    const res = await pool.query(`
      UPDATE people p SET site_id = COALESCE(
        (SELECT u.assigned_site_id FROM users u
           WHERE u.person_id = p.id AND u.org_id = p.org_id AND u.deleted_at IS NULL
             AND u.assigned_site_id IS NOT NULL LIMIT 1),
        (SELECT c.site_id FROM crew_members cm JOIN crews c ON c.id = cm.crew_id AND c.org_id = p.org_id
           WHERE cm.person_id = p.id AND cm.org_id = p.org_id AND c.deleted_at IS NULL LIMIT 1),
        (SELECT v.assigned_site_id FROM vehicles v
           WHERE v.assigned_driver_person_id = p.id AND v.org_id = p.org_id AND v.deleted_at IS NULL
             AND v.assigned_site_id IS NOT NULL LIMIT 1),
        (SELECT cu.assigned_site_id FROM users cu
           WHERE cu.id = p.created_by AND cu.org_id = p.org_id AND cu.assigned_site_id IS NOT NULL LIMIT 1)
      )
      WHERE p.site_id IS NULL AND p.deleted_at IS NULL
    `);
    const after = await pool.query(`SELECT count(*)::int AS n FROM people WHERE site_id IS NULL AND deleted_at IS NULL`);
    // eslint-disable-next-line no-console
    console.log(`people.site_id backfill: ${before.rows[0].n} null → filled ${res.rowCount} → ${after.rows[0].n} still null (no derivable site)`);
  } finally {
    await pool.end();
  }
}

void main();
