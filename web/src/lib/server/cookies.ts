/**
 * httpOnly auth-cookie definitions — server-only.
 * Tokens are NEVER exposed to client-side JS: access + refresh live in httpOnly cookies,
 * set/rotated exclusively by Route Handlers and proxy.ts.
 */

export const ACCESS_COOKIE = 'tb_access';
export const REFRESH_COOKIE = 'tb_refresh';
export const DEVICE_COOKIE = 'tb_device';

/** Mirrors backend ACCESS_TTL_SEC default (900s). Cookie expiry ≈ token expiry so a
 * missing access cookie is the "needs refresh" signal. */
const ACCESS_TTL_SEC = 900;
/** Mirrors backend REFRESH_TTL_SEC default (30 days). */
const REFRESH_TTL_SEC = 2_592_000;
/** Device id is a stable per-browser identity for the backend's per-device refresh-token slot. */
const DEVICE_TTL_SEC = 31_536_000;

/** Structurally compatible with the options accepted by both `(await cookies()).set`
 * and `NextResponse.cookies.set`. */
export interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  path?: string;
  maxAge?: number;
}

const base: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export function accessCookieOptions(): CookieOptions {
  return { ...base, maxAge: ACCESS_TTL_SEC };
}
export function refreshCookieOptions(): CookieOptions {
  return { ...base, maxAge: REFRESH_TTL_SEC };
}
export function deviceCookieOptions(): CookieOptions {
  return { ...base, maxAge: DEVICE_TTL_SEC };
}

/** A minimal interface satisfied by both `await cookies()` (route handlers) and NextResponse.cookies. */
export interface CookieWriter {
  set(name: string, value: string, options?: CookieOptions): unknown;
  delete(name: string): unknown;
}

export function writeAuthCookies(w: CookieWriter, tokens: { accessToken: string; refreshToken: string }): void {
  w.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions());
  w.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

export function clearAuthCookies(w: CookieWriter): void {
  w.delete(ACCESS_COOKIE);
  w.delete(REFRESH_COOKIE);
  // tb_device is intentionally kept — it is a stable browser identity, not a credential.
}
