import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import {
  type AuthSession,
  type ChangePasswordInput,
  type ContactPanel,
  type ContactPerson,
  type EmergencyContact,
  type LoginInput,
  type Org,
  type User,
  parseOrgConfig,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import { loadEnv } from '../config/env';
import { loadScope } from '../common/scope.util';
import type { Principal } from '../common/current-user.decorator';
import { hashPassword, verifyPassword } from './password';

type Row = Record<string, unknown>;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  private readonly env = loadEnv();
  constructor(
    private readonly dbs: DbService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginInput): Promise<AuthSession> {
    const res = await this.dbs.raw.execute(sql`select * from auth_lookup(${input.username})`);
    const row = (res as unknown as { rows: Row[] }).rows[0];
    if (!row) throw new ApiException('UNAUTHENTICATED', 'Invalid username or password');
    const ok = await verifyPassword(input.password, row.password_hash as string);
    if (!ok) throw new ApiException('UNAUTHENTICATED', 'Invalid username or password');

    const userId = row.user_id as string;
    const orgId = row.org_id as string;
    const tokens = await this.issueTokens(userId, orgId, row.role as User['role'], input.deviceId);
    const { user, org } = await this.loadUserOrg(orgId, userId);
    return { user, org, ...tokens };
  }

  async refresh(refreshToken: string, deviceId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const [userId, orgId] = refreshToken.split('.');
    if (!userId || !orgId) throw new ApiException('UNAUTHENTICATED', 'Malformed refresh token');
    return this.dbs.runInTenant(orgId, async (tx) => {
      const [tok] = await tx
        .select()
        .from(schema.refreshTokens)
        .where(and(eq(schema.refreshTokens.userId, userId), eq(schema.refreshTokens.deviceId, deviceId)));
      if (!tok || tok.revokedAt || tok.tokenHash !== sha256(refreshToken) || tok.expiresAt < new Date()) {
        throw new ApiException('UNAUTHENTICATED', 'Invalid refresh token');
      }
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!u) throw new ApiException('UNAUTHENTICATED', 'User not found');
      await tx.update(schema.refreshTokens).set({ revokedAt: new Date() }).where(eq(schema.refreshTokens.id, tok.id));
      return this.issueTokens(userId, orgId, u.role, deviceId, tx);
    });
  }

  async logout(orgId: string, userId: string, deviceId: string): Promise<void> {
    await this.dbs.runInTenant(orgId, async (tx) => {
      await tx
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.refreshTokens.userId, userId), eq(schema.refreshTokens.deviceId, deviceId)));
    });
  }

  async changePassword(orgId: string, userId: string, input: ChangePasswordInput): Promise<void> {
    await this.dbs.runInTenant(orgId, async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!u) throw new ApiException('NOT_FOUND', 'User not found');
      if (!(await verifyPassword(input.currentPassword, u.passwordHash))) {
        throw new ApiException('VALIDATION_FAILED', 'Current password is incorrect', { currentPassword: 'incorrect' });
      }
      // Phase-4: a forced change that keeps the same password defeats its purpose.
      if (input.newPassword === input.currentPassword) {
        throw new ApiException('VALIDATION_FAILED', 'New password must be different from the current password', {
          newPassword: 'same as current',
        });
      }
      await tx
        .update(schema.users)
        .set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
    });
  }

  async me(orgId: string, userId: string): Promise<{ user: User; org: Org }> {
    return this.loadUserOrg(orgId, userId);
  }

  /**
   * WO-4 (wave 2): resolved tap-to-call panel for the calling user — now mounted on
   * ALL FIVE role dashboards (was worker/driver only). Best-effort by design — a
   * broken link (missing site/crew/SM/TH row) yields null members / an empty list,
   * NEVER an error: a contacts footer must not break a dashboard.
   *
   * SITE_MANAGER gets the UNION of emergency contacts across every site in their
   * scope (`loadScope` — assigned + managed), deduped by phone; siteManager/supervisor
   * stay null for them (an SM is never their own contact). Everyone else never sees
   * themselves surfaced as their own siteManager/supervisor (self-filtered by id).
   */
  async contacts(p: Principal): Promise<ContactPanel> {
    return this.dbs.runInTenant(p.orgId, async (tx) => {
      const ctx = await loadScope(tx, p);
      const loadUser = async (id: string) => {
        const [u] = await tx
          .select()
          .from(schema.users)
          .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)));
        return u;
      };
      const toPerson = (u: { name: string; phone: string | null } | undefined): ContactPerson | null =>
        u ? { name: u.name, phone: u.phone } : null;

      if (ctx.role === 'SITE_MANAGER') {
        const sites = ctx.siteIds.length
          ? await tx
              .select()
              .from(schema.sites)
              .where(and(inArray(schema.sites.id, ctx.siteIds), isNull(schema.sites.deletedAt)))
          : [];
        const byPhone = new Map<string, EmergencyContact>();
        for (const site of sites) {
          const list = (site.emergencyContacts as EmergencyContact[] | null) ?? [];
          for (const c of list) if (!byPhone.has(c.phone)) byPhone.set(c.phone, c);
        }
        return { siteManager: null, supervisor: null, emergency: [...byPhone.values()] };
      }

      const me = await loadUser(p.userId);
      if (!me) return { siteManager: null, supervisor: null, emergency: [] };

      let siteManager: ContactPerson | null = null;
      let emergency: EmergencyContact[] = [];
      if (me.assignedSiteId) {
        const [site] = await tx
          .select()
          .from(schema.sites)
          .where(and(eq(schema.sites.id, me.assignedSiteId), isNull(schema.sites.deletedAt)));
        if (site) {
          emergency = (site.emergencyContacts as EmergencyContact[] | null) ?? [];
          if (site.siteManagerId && site.siteManagerId !== p.userId) {
            siteManager = toPerson(await loadUser(site.siteManagerId));
          }
        }
      }

      let supervisor: ContactPerson | null = null;
      if (me.crewId) {
        const [crew] = await tx
          .select()
          .from(schema.crews)
          .where(and(eq(schema.crews.id, me.crewId), isNull(schema.crews.deletedAt)));
        if (crew && crew.supervisorUserId !== p.userId) supervisor = toPerson(await loadUser(crew.supervisorUserId));
      }

      return { siteManager, supervisor, emergency };
    });
  }

  // --- helpers ---
  private async issueTokens(
    userId: string,
    orgId: string,
    role: User['role'],
    deviceId: string,
    existingTx?: Tx,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, orgId, role, deviceId },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.ACCESS_TTL_SEC },
    );
    const refreshToken = `${userId}.${orgId}.${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TTL_SEC * 1000);

    const persist = async (tx: Tx): Promise<void> => {
      await tx
        .insert(schema.refreshTokens)
        .values({ id: uuidv7(), orgId, userId, deviceId, tokenHash: sha256(refreshToken), expiresAt })
        .onConflictDoUpdate({
          target: [schema.refreshTokens.userId, schema.refreshTokens.deviceId],
          set: { tokenHash: sha256(refreshToken), expiresAt, revokedAt: null },
        });
    };
    if (existingTx) await persist(existingTx);
    else await this.dbs.runInTenant(orgId, persist);
    return { accessToken, refreshToken };
  }

  private async loadUserOrg(orgId: string, userId: string): Promise<{ user: User; org: Org }> {
    return this.dbs.runInTenant(orgId, async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      const [o] = await tx.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
      if (!u || !o) throw new ApiException('NOT_FOUND', 'Account not found');
      return { user: mapUser(u), org: mapOrg(o) };
    });
  }
}

function mapUser(u: typeof schema.users.$inferSelect): User {
  return {
    id: u.id,
    orgId: u.orgId,
    personId: u.personId,
    name: u.name,
    username: u.username,
    phone: u.phone,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    assignedSiteId: u.assignedSiteId,
    crewId: u.crewId,
    allowedVehicleTypeIds: u.allowedVehicleTypeIds ?? [],
    emergencyContact: u.emergencyContact,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    createdBy: u.createdBy ?? u.id,
    updatedBy: u.updatedBy ?? u.id,
    deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
    version: u.version,
  };
}

function mapOrg(o: typeof schema.orgs.$inferSelect): Org {
  return {
    id: o.id,
    name: o.name,
    code: o.code,
    config: parseOrgConfig(o.config),
    status: o.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
  };
}
