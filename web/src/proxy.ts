/**
 * Next 16 proxy (the renamed middleware convention) — runs before rendering.
 * Two jobs for the protected areas (role homes, /change-password, /):
 *   1. No session cookies at all → redirect to /login.
 *   2. Access cookie expired (it shares the token's 900s TTL) but a refresh
 *      cookie exists → rotate against the backend HERE, because Server
 *      Components can never persist rotated cookies. The rotated access token
 *      is injected into the forwarded request so this render already sees it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE, isApiFailure } from '@techbuilder/contracts';
import type { ApiResponse, AuthSession } from '@techbuilder/contracts';
import {
  ACCESS_COOKIE,
  DEVICE_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '@/lib/server/cookies';
import { ROLE_AREA_PREFIXES } from '@/lib/roles';

const PROTECTED_PREFIXES = [...ROLE_AREA_PREFIXES, '/change-password', '/dev'];

function isProtected(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const deviceId = request.cookies.get(DEVICE_COOKIE)?.value;

  if (access) return NextResponse.next();

  if (!refresh || !deviceId) {
    return toLogin(request);
  }

  // Access cookie aged out — rotate the pair before this render.
  const origin = process.env.BACKEND_ORIGIN ?? 'http://localhost:4000';
  let rotated: Pick<AuthSession, 'accessToken' | 'refreshToken'> | null = null;
  try {
    const res = await fetch(`${origin}${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh, deviceId }),
      cache: 'no-store',
    });
    const json = (await res.json()) as ApiResponse<Pick<AuthSession, 'accessToken' | 'refreshToken'>>;
    if (res.ok && !isApiFailure(json)) rotated = json.data;
  } catch {
    rotated = null;
  }

  if (!rotated) {
    const res = toLogin(request);
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  // Forward the new access token to THIS render, and persist both on the response.
  request.cookies.set(ACCESS_COOKIE, rotated.accessToken);
  const res = NextResponse.next({ request });
  res.cookies.set(ACCESS_COOKIE, rotated.accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, rotated.refreshToken, refreshCookieOptions());
  return res;
}

function toLogin(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
