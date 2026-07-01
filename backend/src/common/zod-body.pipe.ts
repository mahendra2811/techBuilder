import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiException } from './api-exception';

/** Validate a request body against a zod schema → uniform VALIDATION_FAILED on error. */
export class ZodBody<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      const fields: Record<string, string> = {};
      for (const issue of r.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
      throw new ApiException('VALIDATION_FAILED', 'Request validation failed', fields);
    }
    return r.data;
  }
}
