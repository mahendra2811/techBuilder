import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthSession, ChangePasswordInput, ContactPanel, LoginInput } from '@techbuilder/contracts';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const LoginSchema = z.object({ username: z.string().min(1), password: z.string().min(1), deviceId: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().min(1), deviceId: z.string().min(1) });
const ChangePwSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

// Tighter than the global cap: blunts credential stuffing against these unauthenticated routes.
// NOTE (architecture): the web talks to this API server-to-server through the Next.js proxy, which
// does NOT forward the real client IP — so this caps auth attempts ORG-WIDE (everyone shares the
// proxy's IP), incl. the silent token refreshes every page load can trigger. 30/min was too tight
// (blocked normal multi-user/multi-role use); 100/min still caps a direct-to-origin attacker while
// never biting legit traffic. The COMPLETE per-client defense is edge rate-limiting (real IP) + a
// per-account lockout — tracked follow-up.
const AUTH_THROTTLE = { default: { ttl: 60_000, limit: 100 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body(new ZodBody(LoginSchema)) body: LoginInput): Promise<AuthSession> {
    return this.auth.login(body);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  refresh(@Body(new ZodBody(RefreshSchema)) body: { refreshToken: string; deviceId: string }) {
    return this.auth.refresh(body.refreshToken, body.deviceId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() u: Principal): Promise<{ ok: true }> {
    await this.auth.logout(u.orgId, u.userId, u.deviceId);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(ChangePwSchema)) body: ChangePasswordInput,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(u.orgId, u.userId, body);
    return { ok: true };
  }

}

/** `/me` is top-level per contract ENDPOINTS.me (NOT /auth/me), so it lives in a prefix-less controller. */
@Controller()
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() u: Principal) {
    return this.auth.me(u.orgId, u.userId);
  }

  /** ENDPOINTS.meContacts — any authenticated user; no RBAC action (self-scoped read). */
  @UseGuards(JwtAuthGuard)
  @Get('me/contacts')
  contacts(@CurrentUser() u: Principal): Promise<ContactPanel> {
    return this.auth.contacts(u);
  }
}
