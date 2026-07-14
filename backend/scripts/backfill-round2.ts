/** One-off Round-2 backfill for the live DevCo org: accountant login + sites.accountantId + drivers→crews. */
import { Pool } from 'pg';
import { uuidv7 } from 'uuidv7';
import { hashPassword } from '../src/auth/password';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN });
  const c = await pool.connect();
  try {
    const { rows: [org] } = await c.query(`SELECT id FROM orgs WHERE code='devco'`);
    if (!org) throw new Error('devco org not found');
    const orgId = org.id;

    // 1) Accountant login (idempotent by username) — covers BOTH sites (per-site mechanics, one person).
    const { rows: [existingAcc] } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND username='acct1' AND deleted_at IS NULL`, [orgId]);
    let accId = existingAcc?.id;
    if (!accId) {
      accId = uuidv7();
      const hash = await hashPassword('changeme123');
      const { rows: [site] } = await c.query(
        `SELECT id FROM sites WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, [orgId]);
      await c.query(
        `INSERT INTO users (id, org_id, name, username, role, password_hash, must_change_password, assigned_site_id, active, created_by, updated_by)
         VALUES ($1,$2,'Munshi Ji','acct1','ACCOUNTANT',$3,false,$4,true,$1,$1)`,
        [accId, orgId, hash, site.id]);
      console.log('created accountant acct1 /', accId);
    } else console.log('accountant acct1 exists', accId);

    const r1 = await c.query(`UPDATE sites SET accountant_id=$1, updated_at=now() WHERE org_id=$2 AND deleted_at IS NULL AND accountant_id IS NULL`, [accId, orgId]);
    console.log('sites assigned accountant:', r1.rowCount);

    // 2) Drivers → crews: put each driver into a crew at his vehicle's site (first crew of that site).
    const { rows: drivers } = await c.query(
      `SELECT u.id, u.username, u.person_id FROM users u WHERE u.org_id=$1 AND u.role='DRIVER' AND u.deleted_at IS NULL AND u.crew_id IS NULL`, [orgId]);
    for (const d of drivers) {
      const { rows: [v] } = await c.query(
        `SELECT assigned_site_id FROM vehicles WHERE org_id=$1 AND assigned_driver_person_id=$2 AND deleted_at IS NULL LIMIT 1`,
        [orgId, d.person_id]);
      const siteId = v?.assigned_site_id;
      if (!siteId) { console.log('driver', d.username, '— no vehicle/site, skipped'); continue; }
      const { rows: [crew] } = await c.query(
        `SELECT id FROM crews WHERE org_id=$1 AND site_id=$2 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, [orgId, siteId]);
      if (!crew) { console.log('driver', d.username, '— no crew at site, skipped'); continue; }
      await c.query(`UPDATE users SET crew_id=$1, updated_at=now() WHERE id=$2`, [crew.id, d.id]);
      console.log('driver', d.username, '→ crew', crew.id);
    }

    // 3) Org config JSON: the enum rename doesn't touch jsonb — swap TEAM_HEAD → SUPERVISOR
    // in roles.enabled (+ enable ACCOUNTANT) and re-key completion.requiredRecordsByRole.
    const { rows: [orgRow] } = await c.query(`SELECT config FROM orgs WHERE id=$1`, [orgId]);
    const cfg = orgRow.config;
    if (Array.isArray(cfg?.roles?.enabled)) {
      cfg.roles.enabled = cfg.roles.enabled.map((r: string) => (r === 'TEAM_HEAD' ? 'SUPERVISOR' : r));
      if (!cfg.roles.enabled.includes('ACCOUNTANT')) cfg.roles.enabled.push('ACCOUNTANT');
    }
    if (cfg?.completion?.requiredRecordsByRole?.TEAM_HEAD) {
      cfg.completion.requiredRecordsByRole.SUPERVISOR = cfg.completion.requiredRecordsByRole.TEAM_HEAD;
      delete cfg.completion.requiredRecordsByRole.TEAM_HEAD;
    }
    await c.query(`UPDATE orgs SET config=$1, updated_at=now() WHERE id=$2`, [cfg, orgId]);
    console.log('org config roles.enabled →', JSON.stringify(cfg?.roles?.enabled));

    const { rows: chk } = await c.query(
      `SELECT (SELECT count(*) FROM users WHERE org_id=$1 AND role='DRIVER' AND crew_id IS NOT NULL AND deleted_at IS NULL) drivers_in_crews,
              (SELECT count(*) FROM sites WHERE org_id=$1 AND accountant_id IS NOT NULL AND deleted_at IS NULL) sites_with_accountant`, [orgId]);
    console.log('verify:', chk[0]);
  } finally { c.release(); await pool.end(); }
}
void main();
