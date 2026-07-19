/**
 * P0/P1 SECURITY-AUDIT REGRESSION SUITE (2026-07-19) — runs against the LIVE DB in backend/.env
 * through the real DbService (RLS-enforced app role) + real services. One test per fix that has
 * observable service-level behavior. (The zod `.positive()` guards and the CHECK constraints are
 * enforced at the controller / DB layers respectively — the CHECK is applied by `db:deploy`, not
 * here, since the app role can't ALTER TABLE — so negative-amount-via-sync is guarded by that
 * constraint, not by this suite.)
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import * as schema from '@techbuilder/contracts/db/schema';
import { parseOrgConfig } from '@techbuilder/contracts';
import type { SyncEvent } from '@techbuilder/contracts';
import { DbService } from '../src/db/db.service';
import type { Principal } from '../src/common/current-user.decorator';
import { RecordsService } from '../src/records/records.service';
import { SyncService } from '../src/sync/sync.service';
import { AuthService } from '../src/auth/auth.service';
import { businessDateNow } from '../src/common/business-date';

const HAS_DB = !!process.env.DATABASE_URL;

const orgId = uuidv7();
const siteId = uuidv7();
const ownerId = uuidv7();
const smId = uuidv7();
const supId = uuidv7();
const crewId = uuidv7();
const deactivatedId = uuidv7();

const principal = (userId: string, role: Principal['role']): Principal => ({ userId, orgId, role, deviceId: 'test' });
const OWNER = () => principal(ownerId, 'OWNER');
const SM = () => principal(smId, 'SITE_MANAGER');
const SUPERVISOR = () => principal(supId, 'SUPERVISOR');

const TODAY = businessDateNow(new Date(), '20:00');
const audit = (by: string) => ({ createdBy: by, updatedBy: by });
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

describe.skipIf(!HAS_DB)('audit-fix regressions (live DB, RLS app role)', () => {
  let dbs: DbService;
  let records: RecordsService;
  let sync: SyncService;
  let auth: AuthService;

  beforeAll(async () => {
    dbs = new DbService();
    records = new RecordsService(dbs);
    sync = new SyncService(dbs);
    auth = new AuthService(dbs, new JwtService({ secret: 'test-secret-at-least-16-chars' }));

    const config = parseOrgConfig({
      brand: { name: 'AuditFix Co', primaryColor: '#111111' },
      locale: {},
      roles: { enabled: ['OWNER', 'SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'] },
      records: { enabled: ['progress', 'expense', 'fuel', 'attendance'] },
      features: {},
      vehicleTypes: [{ key: 'truck', labelHi: 'ट्रक', labelEn: 'Truck', trackingMode: 'KM', extraFields: [] }],
      wage: {},
      reconciliation: {},
      completion: {},
    });

    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.orgs).values({ id: orgId, name: 'AuditFix Co', code: `auditfix-${orgId.slice(-8)}`, config, ...audit(ownerId) });
      await tx.insert(schema.sites).values({ id: siteId, orgId, name: 'Site A', code: 'A', siteManagerId: smId, ...audit(ownerId) });
      await tx.insert(schema.crews).values({ id: crewId, orgId, siteId, supervisorUserId: supId, name: 'Crew A1', ...audit(ownerId) });
      await tx.insert(schema.users).values([
        { id: ownerId, orgId, name: 'Owner', username: `o-${ownerId.slice(-8)}`, role: 'OWNER', passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: smId, orgId, name: 'SM', username: `sm-${smId.slice(-8)}`, role: 'SITE_MANAGER', assignedSiteId: siteId, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: supId, orgId, name: 'Sup', username: `sup-${supId.slice(-8)}`, role: 'SUPERVISOR', assignedSiteId: siteId, crewId, passwordHash: 'x', mustChangePassword: false, active: true, ...audit(ownerId) },
        { id: deactivatedId, orgId, name: 'Gone', username: `gone-${deactivatedId.slice(-8)}`, role: 'WORKER', assignedSiteId: siteId, passwordHash: 'x', mustChangePassword: false, active: false, ...audit(ownerId) },
      ]);
    });
  }, 120_000);

  afterAll(async () => {
    if (!dbs) return;
    await dbs.runInTenant(orgId, async (tx) => {
      for (const t of [schema.refreshTokens, schema.approvalRequests, schema.expenses, schema.crews, schema.users, schema.sites]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.delete(t).where(eq((t as any).orgId, orgId));
      }
      await tx.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
    });
    await dbs.onModuleDestroy();
  }, 120_000);

  // ---- SUP-9: supervisor never books an expense directly ----
  it('SUPERVISOR direct expense is forbidden (request-only)', async () => {
    await expect(
      records.createExpense(SUPERVISOR(), { id: uuidv7(), siteId, category: 'MISC', amountPaise: 5_000, businessDate: TODAY }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { amountPaise: 'OVER_DIRECT_LIMIT' } });
  });

  // ---- P0-1: sync CREATE strips client-supplied verification/void state ----
  it('sync CREATE cannot self-verify an expense (server-owned fields stripped)', async () => {
    const id = uuidv7();
    const ev: SyncEvent = {
      outboxId: uuidv7(),
      op: 'CREATE',
      entityType: 'expense',
      payload: {
        id,
        siteId,
        category: 'MISC',
        amountPaise: 7_000,
        businessDate: TODAY,
        // hostile fields a crafted client tries to sneak in:
        verifiedAt: new Date().toISOString(),
        verifiedBy: smId,
        flagged: false,
        void: false,
      },
    };
    const [res] = await sync.pushBatch(SM(), [ev]);
    expect(res.ok).toBe(true);
    const stored = await dbs.runInTenant(orgId, async (tx) => {
      const [row] = await tx.select().from(schema.expenses).where(eq(schema.expenses.id, id));
      return row;
    });
    expect(stored?.verifiedAt).toBeNull();
    expect(stored?.verifiedBy).toBeNull();
    expect(stored?.flagged).toBe(false);
  });

  // ---- P0-1: sync UPDATE cannot edit an accountant-verified expense ----
  it('sync UPDATE cannot modify a verified (permanent) expense → CONFLICT', async () => {
    const id = uuidv7();
    await records.createExpense(SM(), { id, siteId, category: 'MISC', amountPaise: 9_000, businessDate: TODAY, remark: 'original' });
    await records.verifyExpense(OWNER(), id, { ok: true }); // Owner may verify
    const ev: SyncEvent = {
      outboxId: uuidv7(),
      op: 'UPDATE',
      // siteId is required by the sync scope check; it's stripped from the actual mutation.
      payload: { id, siteId, remark: 'tampered' },
      entityType: 'expense',
    };
    const [res] = await sync.pushBatch(SM(), [ev]);
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('CONFLICT');
    const stored = await dbs.runInTenant(orgId, async (tx) => {
      const [row] = await tx.select().from(schema.expenses).where(eq(schema.expenses.id, id));
      return row;
    });
    expect(stored?.remark).toBe('original');
  });

  // ---- P0-3: a deactivated user cannot mint new tokens via refresh ----
  it('deactivated user cannot refresh (immediate, not TTL-delayed)', async () => {
    const deviceId = 'dev-1';
    const token = `${deactivatedId}.${orgId}.${'a'.repeat(64)}`;
    await dbs.runInTenant(orgId, async (tx) => {
      await tx.insert(schema.refreshTokens).values({
        id: uuidv7(),
        orgId,
        userId: deactivatedId,
        deviceId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    });
    await expect(auth.refresh(token, deviceId)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    // and the token is now revoked
    const tok = await dbs.runInTenant(orgId, async (tx) => {
      const [row] = await tx.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, deactivatedId));
      return row;
    });
    expect(tok?.revokedAt).not.toBeNull();
  });
});
