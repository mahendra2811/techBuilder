/**
 * frozen.10 one-off backfill (COMBINED-BUILD-PLAN §3a + config):
 *  1. devco → canonical test layout: per-site 1 SM + 1 accountant + 2 supervisors (additive —
 *     nothing is moved; new logins sm2/acct2/th3/th4 + crews are created where missing, and
 *     drivers/workers get spread across crews so each hangs under exactly one supervisor).
 *  2. Every org: an "Other" material (supervisor-loggable) if none exists (SUP-4/D13).
 *  3. Every org: config.expense.thBackdateDays → 1 where a larger value is pinned (D1).
 * Idempotent. Run: DATABASE_URL_ADMIN=... npx tsx scripts/backfill-frozen10.ts
 * NOTE: complaint numbering was backfilled inside migration 0005 itself.
 */
import { Pool, type PoolClient } from 'pg';
import { uuidv7 } from 'uuidv7';
import { hashPassword } from '../src/auth/password';

async function ensureUser(
  c: PoolClient,
  orgId: string,
  username: string,
  name: string,
  role: string,
  siteId: string | null,
  crewId: string | null,
  personId: string | null,
  hash: string,
): Promise<string> {
  const { rows: [existing] } = await c.query(
    `SELECT id FROM users WHERE org_id=$1 AND username=$2 AND deleted_at IS NULL`, [orgId, username]);
  if (existing) return existing.id;
  const id = uuidv7();
  await c.query(
    `INSERT INTO users (id, org_id, name, username, role, password_hash, must_change_password, assigned_site_id, crew_id, person_id, active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8,$9,true,$1,$1)`,
    [id, orgId, name, username, role, hash, siteId, crewId, personId]);
  console.log('created', role, username);
  return id;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN });
  const c = await pool.connect();
  try {
    const hash = await hashPassword('changeme123');
    const { rows: [org] } = await c.query(`SELECT id FROM orgs WHERE code='devco'`);
    if (!org) throw new Error('devco org not found');
    const orgId = org.id;

    const { rows: sites } = await c.query(
      `SELECT id, name, site_manager_id, accountant_id FROM sites WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [orgId]);
    if (sites.length < 2) throw new Error(`expected 2 devco sites, found ${sites.length}`);
    const [site1, site2] = sites;

    // --- 1a. One SM per site: sm1 keeps site1; sm2 (new) takes site2.
    const { rows: [sm1] } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND username='sm1' AND deleted_at IS NULL`, [orgId]);
    if (sm1) {
      await c.query(`UPDATE users SET assigned_site_id=$1, updated_at=now() WHERE id=$2 AND (assigned_site_id IS DISTINCT FROM $1)`, [site1.id, sm1.id]);
      await c.query(`UPDATE sites SET site_manager_id=$1, updated_at=now() WHERE id=$2`, [sm1.id, site1.id]);
    }
    const sm2Id = await ensureUser(c, orgId, 'sm2', 'SM Two', 'SITE_MANAGER', site2.id, null, null, hash);
    await c.query(`UPDATE sites SET site_manager_id=$1, updated_at=now() WHERE id=$2`, [sm2Id, site2.id]);

    // --- 1b. One accountant per site: acct1 keeps site1; acct2 (new) takes site2.
    const { rows: [acct1] } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND username='acct1' AND deleted_at IS NULL`, [orgId]);
    if (acct1) {
      await c.query(`UPDATE users SET assigned_site_id=$1, updated_at=now() WHERE id=$2`, [site1.id, acct1.id]);
      await c.query(`UPDATE sites SET accountant_id=$1, updated_at=now() WHERE id=$2`, [acct1.id, site1.id]);
    }
    const acct2Id = await ensureUser(c, orgId, 'acct2', 'Munshi Two', 'ACCOUNTANT', site2.id, null, null, hash);
    await c.query(`UPDATE sites SET accountant_id=$1, updated_at=now() WHERE id=$2`, [acct2Id, site2.id]);

    // --- 1c. Two supervisors per site (additive — existing th1/th2 stay put).
    for (const [uname, pname, site] of [
      ['th3', 'Mistri Three', site1],
      ['th4', 'Mistri Four', site2],
    ] as const) {
      const { rows: [existing] } = await c.query(
        `SELECT id, crew_id FROM users WHERE org_id=$1 AND username=$2 AND deleted_at IS NULL`, [orgId, uname]);
      let supId = existing?.id;
      if (!supId) supId = await ensureUser(c, orgId, uname, pname, 'SUPERVISOR', site.id, null, null, hash);
      const { rows: [crew] } = await c.query(
        `SELECT id FROM crews WHERE org_id=$1 AND team_head_user_id=$2 AND deleted_at IS NULL`, [orgId, supId]);
      if (!crew) {
        const crewId = uuidv7();
        await c.query(
          `INSERT INTO crews (id, org_id, site_id, name, team_head_user_id, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$5,$5)`, [crewId, orgId, site.id, `${pname} crew`, supId]);
        console.log('created crew for', uname);
      }
    }

    // --- 1d. Ensure driver4/worker4 logins exist + every driver1-4/worker1-4 sits in a crew.
    const { rows: crews } = await c.query(
      `SELECT c.id, c.site_id, u.username AS sup FROM crews c JOIN users u ON u.id=c.team_head_user_id
       WHERE c.org_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at`, [orgId]);
    const crewAt = (siteId: string, n: number) => crews.filter((k) => k.site_id === siteId)[n]?.id ?? crews[0]?.id;

    // driver4 (+person) if absent
    const { rows: [d4] } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND username='driver4' AND deleted_at IS NULL`, [orgId]);
    if (!d4) {
      const pid = uuidv7();
      await c.query(
        `INSERT INTO people (id, org_id, name, skill, active, created_by, updated_by) VALUES ($1,$2,'Dinesh Driver','DRIVER',true,$1,$1)`,
        [pid, orgId]);
      await ensureUser(c, orgId, 'driver4', 'Dinesh Driver', 'DRIVER', null, crewAt(site2.id, 1), pid, hash);
    }
    // worker4 if absent (workers 1-3 exist per seed; 4 may too — idempotent)
    const { rows: [w4] } = await c.query(
      `SELECT id FROM users WHERE org_id=$1 AND username='worker4' AND deleted_at IS NULL`, [orgId]);
    if (!w4) {
      const pid = uuidv7();
      await c.query(
        `INSERT INTO people (id, org_id, name, skill, active, created_by, updated_by) VALUES ($1,$2,'Waqar Worker','UNSKILLED',true,$1,$1)`,
        [pid, orgId]);
      await ensureUser(c, orgId, 'worker4', 'Waqar Worker', 'WORKER', site2.id, crewAt(site2.id, 1), pid, hash);
    }
    // Spread crewless driver1-4/worker1-4 across crews (site1 users → site1 crews, else site2).
    const { rows: pending } = await c.query(
      `SELECT id, username, role, assigned_site_id FROM users
       WHERE org_id=$1 AND deleted_at IS NULL AND crew_id IS NULL
         AND username ~ '^(driver|worker)[1-4]$'`, [orgId]);
    let i = 0;
    for (const u of pending) {
      const siteId = u.assigned_site_id ?? (i % 2 === 0 ? site1.id : site2.id);
      const crewId = crewAt(siteId, i % 2);
      if (crewId) {
        await c.query(`UPDATE users SET crew_id=$1, updated_at=now() WHERE id=$2`, [crewId, u.id]);
        console.log(u.username, '→ crew at site', siteId === site1.id ? 1 : 2);
      }
      i++;
    }

    // --- 2. "Other" material per org (all orgs).
    const { rows: orgs } = await c.query(`SELECT id, code FROM orgs WHERE deleted_at IS NULL`);
    for (const o of orgs) {
      const { rows: [other] } = await c.query(
        `SELECT id FROM materials WHERE org_id=$1 AND lower(name)='other' AND deleted_at IS NULL`, [o.id]);
      if (!other) {
        await c.query(
          `INSERT INTO materials (id, org_id, name, uom, config, created_by, updated_by)
           VALUES ($1,$2,'Other','NOS','{"supervisorLogs":true,"driverPicks":false,"driverViews":false}'::jsonb,$1,$1)`,
          [uuidv7(), o.id]);
        console.log(o.code, '— created "Other" material');
      }
    }

    // --- 3. thBackdateDays → 1 where pinned larger.
    for (const o of orgs) {
      const { rows: [row] } = await c.query(
        `SELECT config->'expense'->>'thBackdateDays' AS days FROM orgs WHERE id=$1`, [o.id]);
      if (row?.days !== null && Number(row.days) > 1) {
        await c.query(
          `UPDATE orgs SET config = jsonb_set(config, '{expense,thBackdateDays}', '1'::jsonb), updated_at=now() WHERE id=$1`, [o.id]);
        console.log(o.code, `— thBackdateDays ${row.days} → 1`);
      }
    }

    // --- verify
    const { rows: chk } = await c.query(
      `SELECT s.name, sm.username AS sm, a.username AS acct,
              (SELECT count(*) FROM crews c WHERE c.site_id=s.id AND c.deleted_at IS NULL) AS crews
       FROM sites s LEFT JOIN users sm ON sm.id=s.site_manager_id LEFT JOIN users a ON a.id=s.accountant_id
       WHERE s.org_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at`, [orgId]);
    console.log('verify sites:', chk);
    const { rows: crewChk } = await c.query(
      `SELECT u.username, u.role, c.name AS crew FROM users u LEFT JOIN crews c ON c.id=u.crew_id
       WHERE u.org_id=$1 AND u.deleted_at IS NULL AND u.role IN ('DRIVER','WORKER') AND u.username ~ '^(driver|worker)[1-4]$' ORDER BY u.username`, [orgId]);
    console.log('verify crew links:', crewChk);
  } finally { c.release(); await pool.end(); }
}
void main();
