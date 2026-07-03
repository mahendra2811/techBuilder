/**
 * POST /api/auth/logout — best-effort backend logout (revokes the device's
 * refresh token server-side), then clears the httpOnly auth cookies.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, clearAuthCookies } from '@/lib/server/cookies';
import { backendLogout } from '@/lib/server/backend';

export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    // Best-effort: an expired/invalid token must not block local logout.
    await backendLogout(accessToken).catch(() => undefined);
  }
  const res = NextResponse.json({ data: { ok: true } });
  clearAuthCookies(res.cookies);
  return res;
}
