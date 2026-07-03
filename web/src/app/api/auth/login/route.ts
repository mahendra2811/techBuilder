/**
 * POST /api/auth/login — proxies the real backend login server-side and stores
 * the tokens in httpOnly cookies. The response body contains ONLY { user, org }.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { backendLogin } from '@/lib/server/backend';
import {
  DEVICE_COOKIE,
  deviceCookieOptions,
  writeAuthCookies,
} from '@/lib/server/cookies';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = body?.username?.trim();
  const password = body?.password;
  if (!username || !password) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'username and password are required', traceId: 'web-local' } },
      { status: 400 },
    );
  }

  // Stable per-browser device id (backend keeps one refresh-token slot per user+device).
  const deviceId = req.cookies.get(DEVICE_COOKIE)?.value ?? crypto.randomUUID();

  const result = await backendLogin({ username, password, deviceId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { user, org, accessToken, refreshToken } = result.data;
  const res = NextResponse.json({ data: { user, org } });
  writeAuthCookies(res.cookies, { accessToken, refreshToken });
  res.cookies.set(DEVICE_COOKIE, deviceId, deviceCookieOptions());
  return res;
}
