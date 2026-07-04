/**
 * Server-side client for the real NestJS backend — the ONLY place the web app
 * talks to the backend. Runs in Route Handlers, Server Components and proxy.ts.
 *
 * - Envelope handling mirrors shared/src/errors.ts (imported, never redefined).
 * - Bearer token comes from the httpOnly access cookie (never client JS).
 */
import { cookies } from 'next/headers';
import { API_BASE, isApiFailure } from '@techbuilder/contracts';
import type { ApiError, ApiResponse, AuthSession, Org, User } from '@techbuilder/contracts';
import { ACCESS_COOKIE, DEVICE_COOKIE, REFRESH_COOKIE } from './cookies';

/** Backend ORIGIN (no /api/v1 suffix — that comes from the frozen API_BASE). */
function backendOrigin(): string {
  return process.env.BACKEND_ORIGIN ?? 'http://localhost:4000';
}

export type BackendMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type BackendResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

const INTERNAL_ERROR: ApiError = {
  code: 'INTERNAL',
  message: 'Backend unreachable or returned a malformed response',
  traceId: 'web-local',
};

/**
 * Low-level call to the backend. `path` is relative to API_BASE, e.g. "/auth/login".
 * Never throws on HTTP/envelope errors — returns a discriminated result.
 */
export async function backendFetch<T>(
  method: BackendMethod,
  path: string,
  opts: { body?: unknown; accessToken?: string | null } = {},
): Promise<BackendResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${backendOrigin()}${API_BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 502, error: INTERNAL_ERROR };
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json === null) {
    return { ok: false, status: res.status || 502, error: INTERNAL_ERROR };
  }
  if (isApiFailure(json)) {
    return { ok: false, status: res.status, error: json.error };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: INTERNAL_ERROR };
  }
  return { ok: true, status: res.status, data: json.data };
}

// ---------------------------------------------------------------------------
// Auth primitives (used by the auth Route Handlers + the API proxy)
// ---------------------------------------------------------------------------

export function backendLogin(input: {
  username: string;
  password: string;
  deviceId: string;
}): Promise<BackendResult<AuthSession>> {
  return backendFetch<AuthSession>('POST', '/auth/login', { body: input });
}

export function backendRefresh(
  refreshToken: string,
  deviceId: string,
): Promise<BackendResult<Pick<AuthSession, 'accessToken' | 'refreshToken'>>> {
  return backendFetch('POST', '/auth/refresh', { body: { refreshToken, deviceId } });
}

export function backendLogout(accessToken: string): Promise<BackendResult<{ ok: true }>> {
  return backendFetch('POST', '/auth/logout', { accessToken });
}

// ---------------------------------------------------------------------------
// Session helpers for Server Components / layouts
// ---------------------------------------------------------------------------

export interface Session {
  user: User;
  org: Org;
}

/** Read the raw auth cookies (server-side only). */
export async function readAuthCookies(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
}> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: store.get(REFRESH_COOKIE)?.value ?? null,
    deviceId: store.get(DEVICE_COOKIE)?.value ?? null,
  };
}

/**
 * Short-lived in-memory memo for GET /me, keyed by access token.
 *
 * Why: every SSR render of a protected page calls getSession(); against a
 * remote Postgres (Neon) that round-trip costs 1.5–2s of TTFB PER PAGE VIEW.
 * The access token itself already has a 15-minute validity window, so serving
 * the same token's /me for up to 60s does not weaken auth (the token is what
 * authenticates; role/flag changes propagate within the TTL).
 *
 * Invalidation: password change busts the entry (see /api/proxy route);
 * login/refresh mint NEW tokens, which are new cache keys by construction.
 */
const SESSION_MEMO_TTL_MS = 60_000;
const SESSION_MEMO_MAX = 500;
const sessionMemo = new Map<string, { at: number; session: Session }>();

export function invalidateSessionMemo(accessToken: string | null | undefined): void {
  if (accessToken) sessionMemo.delete(accessToken);
}

/**
 * Resolve the current session via GET /me using the httpOnly access cookie.
 * Server Components cannot rotate cookies, so NO refresh is attempted here —
 * proxy.ts refreshes an expired access cookie before rendering ever starts.
 * Returns null when unauthenticated.
 */
export async function getSession(): Promise<Session | null> {
  const { accessToken } = await readAuthCookies();
  if (!accessToken) return null;

  const hit = sessionMemo.get(accessToken);
  if (hit && Date.now() - hit.at < SESSION_MEMO_TTL_MS) return hit.session;

  const res = await backendFetch<Session>('GET', '/me', { accessToken });
  if (!res.ok) {
    sessionMemo.delete(accessToken);
    return null;
  }
  sessionMemo.set(accessToken, { at: Date.now(), session: res.data });
  if (sessionMemo.size > SESSION_MEMO_MAX) {
    // Map iterates in insertion order — drop the oldest half.
    for (const key of sessionMemo.keys()) {
      if (sessionMemo.size <= SESSION_MEMO_MAX / 2) break;
      sessionMemo.delete(key);
    }
  }
  return res.data;
}
