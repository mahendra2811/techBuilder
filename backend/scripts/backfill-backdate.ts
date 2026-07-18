/**
 * frozen.9 one-off backfill: worker/driver expense-request backdate window 3 options → 2
 * (config.expense.requestBackdateDays 2 → 1) for EVERY existing org.
 *
 * Needed because the seed stores the fully-materialized OrgConfig jsonb — the old default (2)
 * sits in the row explicitly, so the new zod default never applies to existing orgs.
 * Idempotent: only touches rows still carrying the old value.
 *
 * Run: DATABASE_URL_ADMIN=... npx tsx scripts/backfill-backdate.ts
 */
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN });
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      `SELECT id, code, config->'expense'->>'requestBackdateDays' AS days FROM orgs WHERE deleted_at IS NULL`,
    );
    for (const org of rows) {
      if (org.days === null) {
        console.log(org.code, '— no explicit value (zod default applies), skipped');
        continue;
      }
      if (Number(org.days) <= 1) {
        console.log(org.code, `— already ${org.days}, skipped`);
        continue;
      }
      await c.query(
        `UPDATE orgs SET config = jsonb_set(config, '{expense,requestBackdateDays}', '1'::jsonb), updated_at = now() WHERE id = $1`,
        [org.id],
      );
      console.log(org.code, `— requestBackdateDays ${org.days} → 1`);
    }
    const { rows: chk } = await c.query(
      `SELECT code, config->'expense'->>'requestBackdateDays' AS days FROM orgs WHERE deleted_at IS NULL`,
    );
    console.log('verify:', chk);
  } finally {
    c.release();
    await pool.end();
  }
}
void main();
