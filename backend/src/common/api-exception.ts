import type { ErrorCode, FieldErrors } from '@techbuilder/contracts';

/** Throw this anywhere; the global filter renders it as the uniform error envelope. */
export class ApiException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE: 409,
  RATE_LIMITED: 429,
  PASSWORD_CHANGE_REQUIRED: 403,
  CONFIG_INVALID: 422,
  INTERNAL: 500,
};

export function httpStatusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
