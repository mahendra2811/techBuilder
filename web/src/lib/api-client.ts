/**
 * Client-side API wrapper. Browser JS NEVER sees tokens — every call goes to the
 * Next.js server (same-origin, cookies ride along automatically):
 *   - /api/auth/*          dedicated auth Route Handlers (cookie set/rotate/clear)
 *   - /api/proxy/<path>    authenticated gateway to the backend (transparent
 *                          one-shot refresh + retry lives server-side there)
 *
 * Success `{ data }` is unwrapped; failure `{ error }` is thrown as ApiClientError
 * carrying the frozen envelope fields (code / message / fields / traceId).
 */
import { isApiFailure } from '@techbuilder/contracts';
import type { ApiError, ApiResponse, ErrorCode, FieldErrors, Org, User } from '@techbuilder/contracts';

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly fields?: FieldErrors;
  readonly traceId: string;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.fields = error.fields;
    this.traceId = error.traceId;
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json === null) {
    throw new ApiClientError(
      { code: 'INTERNAL', message: `Malformed response (${res.status})`, traceId: 'web-client' },
      res.status,
    );
  }
  if (isApiFailure(json)) throw new ApiClientError(json.error, res.status);
  return json.data;
}

/** Call the real backend through the authenticated proxy. `path` is relative to /api/v1, e.g. "/me". */
export function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return request<T>(method, `/api/proxy${path}`, body);
}

// ---- auth (dedicated cookie-handling routes) ----

export interface LoginResult {
  user: User;
  org: Org;
}

export function login(input: { username: string; password: string }): Promise<LoginResult> {
  return request<LoginResult>('POST', '/api/auth/login', input);
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>('POST', '/api/auth/logout');
}

export function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  // ChangePasswordInput shape from the frozen contracts; goes via the proxy (no tokens in its response).
  return api<void>('POST', '/auth/change-password', input);
}

export function me(): Promise<{ user: User; org: Org }> {
  return api<{ user: User; org: Org }>('GET', '/me');
}
