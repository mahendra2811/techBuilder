import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiError, ApiFailure, ErrorCode } from '@techbuilder/contracts';
import { ApiException, httpStatusFor } from './api-exception';

/** Renders EVERY error as the frozen envelope `{ error: { code, message, fields?, traceId } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();
    let code: ErrorCode = 'INTERNAL';
    let message = 'Internal server error';
    let fields: ApiError['fields'];
    // For framework HttpExceptions we PRESERVE the real HTTP status (a 429 from the rate
    // limiter, a 503 from the readiness probe) instead of flattening everything to 400 —
    // orchestrators and clients need the true status. ApiException/unknown fall back to
    // httpStatusFor(code).
    let status: number | undefined;

    if (exception instanceof ApiException) {
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = statusToCode(status);
      message = exception.message;
    }

    if (code === 'INTERNAL') this.logger.error({ traceId, exception });
    const body: ApiFailure = { error: { code, message, ...(fields ? { fields } : {}), traceId } };
    res.status(status ?? httpStatusFor(code)).json(body);
  }
}

/** Closest frozen ErrorCode for a raw HTTP status on a framework HttpException. */
function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'CONFIG_INVALID';
    case 429:
      return 'RATE_LIMITED';
    case 400:
      return 'VALIDATION_FAILED';
    default:
      return 'INTERNAL'; // 500/503/… — status is preserved separately
  }
}
