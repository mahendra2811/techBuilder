/**
 * /api/proxy/[...path] — the authenticated gateway between browser JS and the
 * real backend. Attaches the Bearer token from the httpOnly access cookie; on a
 * 401 TOKEN_EXPIRED/UNAUTHENTICATED it refreshes ONCE (rotating the cookies)
 * and retries the original request before giving up.
 *
 * Token-bearing auth endpoints are DENIED here — they have dedicated Route
 * Handlers that keep tokens inside httpOnly cookies.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { ApiError } from '@techbuilder/contracts';
import { backendFetch, backendRefresh, invalidateSessionMemo, type BackendMethod } from '@/lib/server/backend';
import {
  ACCESS_COOKIE,
  DEVICE_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  writeAuthCookies,
} from '@/lib/server/cookies';

/** Paths whose backend responses contain raw tokens — never proxied to client JS. */
const DENYLIST = new Set(['auth/login', 'auth/refresh', 'auth/logout']);

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const joined = path.join('/');
  if (DENYLIST.has(joined)) {
    return NextResponse.json(
      { error: err('FORBIDDEN', `Use the dedicated /api/auth/* route for ${joined}`) },
      { status: 403 },
    );
  }

  const target = `/${joined}${req.nextUrl.search}`;
  const method = req.method as BackendMethod;
  const body =
    method === 'GET' || method === 'DELETE' ? undefined : ((await req.json().catch(() => undefined)) as unknown);

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  // Password change clears mustChangePassword server-side — bust the SSR
  // session memo so the next server render sees the fresh flag immediately.
  if (joined === 'auth/change-password') invalidateSessionMemo(accessToken);
  const first = await backendFetch<unknown>(method, target, { accessToken, body });

  const needsRefresh =
    !first.ok && first.status === 401 && (first.error.code === 'TOKEN_EXPIRED' || first.error.code === 'UNAUTHENTICATED');
  if (!needsRefresh) return respond(first);

  // --- transparent one-shot refresh + retry ---
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const deviceId = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!refreshToken || !deviceId) return respond(first);

  const rotated = await backendRefresh(refreshToken, deviceId);
  if (!rotated.ok) {
    const res = respond(first);
    clearAuthCookies(res.cookies); // refresh chain is dead — force re-login
    return res;
  }

  const second = await backendFetch<unknown>(method, target, { accessToken: rotated.data.accessToken, body });
  const res = respond(second);
  writeAuthCookies(res.cookies, rotated.data); // persist rotation even if the retry failed
  return res;
}

function err(code: ApiError['code'], message: string): ApiError {
  return { code, message, traceId: 'web-local' };
}

function respond(r: Awaited<ReturnType<typeof backendFetch>>): NextResponse {
  return r.ok
    ? NextResponse.json({ data: r.data }, { status: r.status })
    : NextResponse.json({ error: r.error }, { status: r.status });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
