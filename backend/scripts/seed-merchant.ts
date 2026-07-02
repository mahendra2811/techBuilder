/**
 * WP-10 — bulk merchant onboarding seed (dev-side; NO Owner-screen tapping).
 *
 * Usage:  npm run seed:merchant -- merchants/<code>
 * Reads:  org.json + sites.csv + vehicle-types.csv + people.csv + users.csv + crews.csv + vehicles.csv
 *         (see backend/merchants/_template/ for the formats; commas inside values need "quotes")
 * Env:    DATABASE_URL (app role — provisioning works under RLS by setting the org GUC first)
 *
 * Order:  org → vehicle-types → sites → people(+wage rates) → users → crews →
 *         crew-membership (people.crew) → site managers → vehicles(+driver assignment)
 * Safety: aborts if the org code already exists (no partial re-seeding).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig, PERSON_SKILLS, ROLES, VEHICLE_TRACKING_MODES } from '@techbuilder/contracts';
import type { PersonSkill, Role, VehicleTrackingMode } from '@techbuilder/contracts';
import { hashPassword } from '../src/auth/password';

// ---------- tiny CSV parser (handles "quoted, values"; blank lines + \r tolerated) ----------
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field.trim());
    field = '';
  };
  const pushRow = () => {
    if (row.length > 1 || (row[0] ?? '') !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') pushField();
    else if (c === '\n') {
      pushField();
      pushRow();
    } else if (c !== '\r') field += c;
  }
  pushField();
  pushRow();
  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function readCsv(dir: string, name: string, required: boolean): Array<Record<string, string>> {
  const p = resolve(dir, name);
  if (!existsSync(p)) {
    if (required) throw new Error(`Missing required file: ${p}`);
    return [];
  }
  return parseCsv(readFileSync(p, 'utf8'));
}

function need(row: Record<string, string>, key: string, file: string): string {
  const v = row[key];
  if (!v) throw new Error(`${file}: missing required column "${key}" in row ${JSON.stringify(row)}`);
  return v;
}

function oneOf<T extends string>(v: string, allowed: readonly T[], what: string): T {
  const up = v.toUpperCase().replace(/[\s-]+/g, '_') as T;
  if (!allowed.includes(up)) throw new Error(`${what}: "${v}" must be one of ${allowed.join(', ')}`);
  return up;
}

const rupeesToPaise = (v: string): number => Math.round(Number(v) * 100);

async function main(): Promise<void> {
  const dirArg = process.argv[2];
  if (!dirArg) throw new Error('Usage: npm run seed:merchant -- merchants/<code>');
  const dir = resolve(process.cwd(), dirArg);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  // ---------- read + validate all inputs BEFORE touching the DB ----------
  const orgJson = JSON.parse(readFileSync(resolve(dir, 'org.json'), 'utf8')) as {
    name: string;
    code?: string;
    config?: Record<string, unknown>;
  };
  const orgCode = orgJson.code ?? basename(dir);
  const config = parseOrgConfig(orgJson.config ?? { brand: { name: orgJson.name } });

  const sitesCsv = readCsv(dir, 'sites.csv', true);
  const vtypesCsv = readCsv(dir, 'vehicle-types.csv', false);
  const peopleCsv = readCsv(dir, 'people.csv', true);
  const usersCsv = readCsv(dir, 'users.csv', true);
  const crewsCsv = readCsv(dir, 'crews.csv', false);
  const vehiclesCsv = readCsv(dir, 'vehicles.csv', false);

  if (!usersCsv.some((u) => u['role']?.toUpperCase() === 'OWNER')) {
    throw new Error('users.csv must contain exactly one OWNER row');
  }

  const orgId = uuidv7();
  const seededBy = uuidv7(); // audit stamp for rows created before the owner user exists
  const today = new Date().toISOString().slice(0, 10);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);

      // abort if the code is taken (unique anyway — this gives a clean message)
      const clash = await tx.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.code, orgCode));
      if (clash.length) throw new Error(`Org code "${orgCode}" already exists — refusing to re-seed`);

      await tx.insert(schema.orgs).values({ id: orgId, name: orgJson.name, code: orgCode, config, createdBy: seededBy, updatedBy: seededBy });

      // ---- vehicle types ----
      const vtypeIdByName = new Map<string, string>();
      for (const r of vtypesCsv) {
        const id = uuidv7();
        const name = need(r, 'name', 'vehicle-types.csv');
        vtypeIdByName.set(name.toLowerCase(), id);
        await tx.insert(schema.vehicleTypes).values({
          id,
          orgId,
          name,
          trackingMode: oneOf<VehicleTrackingMode>(need(r, 'trackingMode', 'vehicle-types.csv'), VEHICLE_TRACKING_MODES, 'trackingMode'),
          fieldsSchema: [],
          createdBy: seededBy,
          updatedBy: seededBy,
        });
      }

      // ---- sites ----
      const siteIdByCode = new Map<string, string>();
      for (const r of sitesCsv) {
        const id = uuidv7();
        const code = need(r, 'code', 'sites.csv');
        siteIdByCode.set(code, id);
        const weeklyOff = (r['weeklyOff'] ?? '0')
          .split('|')
          .filter((x) => x !== '')
          .map((x) => Number(x));
        await tx.insert(schema.sites).values({
          id,
          orgId,
          name: need(r, 'name', 'sites.csv'),
          code,
          weeklyOff,
          status: 'ACTIVE',
          createdBy: seededBy,
          updatedBy: seededBy,
        });
      }

      // ---- people (labour master) + wage rates ----
      const personIdByName = new Map<string, string>();
      const crewNameByPerson = new Map<string, string>();
      for (const r of peopleCsv) {
        const id = uuidv7();
        const name = need(r, 'name', 'people.csv');
        if (personIdByName.has(name.toLowerCase())) throw new Error(`people.csv: duplicate person name "${name}" — names must be unique (add a surname/village)`);
        personIdByName.set(name.toLowerCase(), id);
        if (r['crew']) crewNameByPerson.set(id, r['crew'].toLowerCase());
        const wage = r['dailyWageRs'] ? rupeesToPaise(r['dailyWageRs']) : null;
        await tx.insert(schema.people).values({
          id,
          orgId,
          name,
          phone: r['phone'] || null,
          skill: r['skill'] ? oneOf<PersonSkill>(r['skill'], PERSON_SKILLS, 'skill') : 'UNSKILLED',
          defaultWagePaise: wage,
          active: true,
          createdBy: seededBy,
          updatedBy: seededBy,
        });
        if (wage) {
          await tx.insert(schema.wageRates).values({
            id: uuidv7(),
            orgId,
            personId: id,
            dailyPaise: wage,
            effectiveFrom: today,
            createdBy: seededBy,
            updatedBy: seededBy,
          });
        }
      }

      // ---- users (crew linkage comes after crews are created) ----
      const userIdByUsername = new Map<string, string>();
      for (const r of usersCsv) {
        const id = uuidv7();
        const username = need(r, 'username', 'users.csv');
        if (userIdByUsername.has(username)) throw new Error(`users.csv: duplicate username "${username}"`);
        userIdByUsername.set(username, id);
        const role = oneOf<Role>(need(r, 'role', 'users.csv'), ROLES, 'role');
        const siteCode = r['site'] ?? '';
        if (siteCode && !siteIdByCode.has(siteCode)) throw new Error(`users.csv: unknown site code "${siteCode}" for ${username}`);
        const personName = (r['personName'] ?? '').toLowerCase();
        if (personName && !personIdByName.has(personName)) throw new Error(`users.csv: unknown personName "${r['personName']}" for ${username}`);
        await tx.insert(schema.users).values({
          id,
          orgId,
          personId: personName ? (personIdByName.get(personName) ?? null) : null,
          name: need(r, 'name', 'users.csv'),
          username,
          phone: r['phone'] || null,
          role,
          passwordHash: await hashPassword(need(r, 'tempPassword', 'users.csv')),
          mustChangePassword: true,
          assignedSiteId: siteCode ? (siteIdByCode.get(siteCode) ?? null) : null,
          active: true,
          createdBy: seededBy,
          updatedBy: seededBy,
        });
      }

      // ---- crews (site + team head) ----
      const crewIdByName = new Map<string, string>();
      for (const r of crewsCsv) {
        const id = uuidv7();
        const name = need(r, 'name', 'crews.csv');
        crewIdByName.set(name.toLowerCase(), id);
        const siteCode = need(r, 'site', 'crews.csv');
        const thUsername = need(r, 'teamHeadUsername', 'crews.csv');
        const siteId = siteIdByCode.get(siteCode);
        const thId = userIdByUsername.get(thUsername);
        if (!siteId) throw new Error(`crews.csv: unknown site code "${siteCode}"`);
        if (!thId) throw new Error(`crews.csv: unknown teamHeadUsername "${thUsername}"`);
        await tx.insert(schema.crews).values({ id, orgId, siteId, teamHeadUserId: thId, name, createdBy: seededBy, updatedBy: seededBy });
        // the team head user belongs to their crew
        await tx.update(schema.users).set({ crewId: id }).where(eq(schema.users.id, thId));
      }

      // ---- crew membership from people.csv `crew` column ----
      for (const [personId, crewName] of crewNameByPerson) {
        const crewId = crewIdByName.get(crewName);
        if (!crewId) throw new Error(`people.csv: unknown crew "${crewName}"`);
        await tx.insert(schema.crewMembers).values({ orgId, crewId, personId });
      }

      // ---- users.csv `crew` column (drivers/workers attached to a crew) ----
      for (const r of usersCsv) {
        const crewName = (r['crew'] ?? '').toLowerCase();
        if (!crewName) continue;
        const crewId = crewIdByName.get(crewName);
        if (!crewId) throw new Error(`users.csv: unknown crew "${r['crew']}"`);
        const uid = userIdByUsername.get(need(r, 'username', 'users.csv'));
        if (uid) await tx.update(schema.users).set({ crewId }).where(eq(schema.users.id, uid));
      }

      // ---- site managers (sites.csv `siteManagerUsername`) ----
      for (const r of sitesCsv) {
        const smUsername = r['siteManagerUsername'] ?? '';
        if (!smUsername) continue;
        const smId = userIdByUsername.get(smUsername);
        if (!smId) throw new Error(`sites.csv: unknown siteManagerUsername "${smUsername}"`);
        const siteId = siteIdByCode.get(need(r, 'code', 'sites.csv'));
        if (siteId) await tx.update(schema.sites).set({ siteManagerId: smId }).where(eq(schema.sites.id, siteId));
      }

      // ---- vehicles (+ optional driver assignment by person name) ----
      for (const r of vehiclesCsv) {
        const typeName = need(r, 'type', 'vehicles.csv').toLowerCase();
        const typeId = vtypeIdByName.get(typeName);
        if (!typeId) throw new Error(`vehicles.csv: unknown vehicle type "${r['type']}"`);
        const siteCode = r['site'] ?? '';
        if (siteCode && !siteIdByCode.has(siteCode)) throw new Error(`vehicles.csv: unknown site code "${siteCode}"`);
        const driverName = (r['driverName'] ?? '').toLowerCase();
        if (driverName && !personIdByName.has(driverName)) throw new Error(`vehicles.csv: unknown driverName "${r['driverName']}"`);
        await tx.insert(schema.vehicles).values({
          id: uuidv7(),
          orgId,
          vehicleTypeId: typeId,
          regNo: need(r, 'regNo', 'vehicles.csv'),
          name: r['name'] || null,
          values: {},
          assignedSiteId: siteCode ? (siteIdByCode.get(siteCode) ?? null) : null,
          assignedDriverPersonId: driverName ? (personIdByName.get(driverName) ?? null) : null,
          status: 'ACTIVE',
          docs: [],
          createdBy: seededBy,
          updatedBy: seededBy,
        });
      }

      // ---------- summary ----------
      // eslint-disable-next-line no-console
      console.log(
        `✅ Seeded org "${orgJson.name}" (code=${orgCode}, id=${orgId})\n` +
          `   sites=${sitesCsv.length} vehicleTypes=${vtypesCsv.length} vehicles=${vehiclesCsv.length}\n` +
          `   people=${peopleCsv.length} crews=${crewsCsv.length} users=${usersCsv.length}\n` +
          `   Logins (temp passwords from users.csv; password change forced on first login):\n` +
          usersCsv.map((u) => `     ${u['role']?.padEnd(12)} ${u['username']}`).join('\n'),
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error('❌ seed-merchant failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
