/**
 * POST /api/auth/refresh — rotates the httpOnly auth cookies via the backend's
 * refresh endpoint. The backend revokes the old refresh token on success, so the
 * rotated pair is ALWAYS persisted here. No tokens in the response body.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { backendRefresh } from '@/lib/server/backend';
import {
  DEVICE_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  writeAuthCookies,
} from '@/lib/server/cookies';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const deviceId = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!refreshToken || !deviceId) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'No refresh session', traceId: 'web-local' } },
      { status: 401 },
    );
  }

  const result = await backendRefresh(refreshToken, deviceId);
  if (!result.ok) {
    const res = NextResponse.json({ error: result.error }, { status: result.status });
    clearAuthCookies(res.cookies); // dead session — drop it
    return res;
  }

  const res = NextResponse.json({ data: { ok: true } });
  writeAuthCookies(res.cookies, result.data);
  return res;
}
