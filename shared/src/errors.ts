/**
 * Uniform error & response envelopes — FROZEN.
 * EVERY endpoint conforms. Frontend maps `code` → localized i18n message.
 */

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'FORBIDDEN', // RBAC/scope denial
  'NOT_FOUND',
  'CONFLICT', // version/LWW conflict on a reject-on-conflict entity (approvals/auth/identity)
  'DUPLICATE', // idempotency replay surfaced as a no-op duplicate
  'RATE_LIMITED',
  'PASSWORD_CHANGE_REQUIRED',
  'CONFIG_INVALID',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Per-field validation messages, keyed by field path. */
export type FieldErrors = Record<string, string>;

export interface ApiError {
  code: ErrorCode;
  message: string; // developer-facing; client shows a localized message by `code`
  fields?: FieldErrors;
  traceId: string;
}

/** The ONLY two response shapes. */
export type ApiFailure = { error: ApiError };
export type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiFailure<T>(r: ApiResponse<T>): r is ApiFailure {
  return (r as ApiFailure).error !== undefined;
}
