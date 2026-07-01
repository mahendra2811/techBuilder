/**
 * Org provisioning + demo seed. Run AFTER db:migrate + db:rls.
 * Provisioning works under the app role because we SET app.org_id = <newOrgId> first,
 * which satisfies the org_self + tenant_isolation policies (no BYPASSRLS needed).
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig, type OrgConfig } from '@techbuilder/contracts';
import { hashPassword } from './auth/password';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  const orgId = uuidv7();
  const ownerId = uuidv7();
  const truckTypeId = uuidv7();
  const jcbTypeId = uuidv7();
  const tempPassword = 'changeme123';

  const config: OrgConfig = parseOrgConfig({
    brand: { name: 'Acme Builders Pvt Ltd', primaryColor: '#1A5276' },
    locale: {},
    roles: { enabled: ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'] },
    records: {
      enabled: ['progress', 'expense', 'fuel', 'trip', 'materialUsage', 'materialMove', 'issue', 'attendance', 'leave', 'vehicleStartEnd'],
    },
    features: {},
    vehicleTypes: [
      { key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] },
      { key: 'jcb', labelHi: 'जेसीबी', labelEn: 'JCB', trackingMode: 'HOURS', extraFields: [] },
    ],
    wage: {},
    reconciliation: {},
    completion: {},
  });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
      await tx.insert(schema.orgs).values({ id: orgId, name: config.brand.name, code: 'acme', config, createdBy: ownerId, updatedBy: ownerId });
      await tx.insert(schema.users).values({
        id: ownerId,
        orgId,
        name: 'Acme Owner',
        username: 'acme_owner',
        role: 'OWNER',
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        createdBy: ownerId,
        updatedBy: ownerId,
      });
      await tx.insert(schema.vehicleTypes).values([
        { id: truckTypeId, orgId, name: 'Truck', trackingMode: 'KM', fieldsSchema: [], createdBy: ownerId, updatedBy: ownerId },
        { id: jcbTypeId, orgId, name: 'JCB', trackingMode: 'HOURS', fieldsSchema: [], createdBy: ownerId, updatedBy: ownerId },
      ]);
    });
    // eslint-disable-next-line no-console
    console.log(`Provisioned org ${orgId}\n  Owner login: acme_owner / ${tempPassword} (must change on first login)`);
  } finally {
    await pool.end();
  }
}

void main();
