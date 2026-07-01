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

    if (exception instanceof ApiException) {
      code = exception.code;
      message = exception.message;
      fields = exception.fields;
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED';
      message = exception.message;
    }

    if (code === 'INTERNAL') this.logger.error({ traceId, exception });
    const body: ApiFailure = { error: { code, message, ...(fields ? { fields } : {}), traceId } };
    res.status(httpStatusFor(code)).json(body);
  }
}
