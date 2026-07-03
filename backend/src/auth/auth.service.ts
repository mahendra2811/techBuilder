import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import {
  type AuthSession,
  type ChangePasswordInput,
  type LoginInput,
  type Org,
  type User,
  parseOrgConfig,
} from '@techbuilder/contracts';
import { DbService, type Tx } from '../db/db.service';
import { ApiException } from '../common/api-exception';
import { loadEnv } from '../config/env';
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
