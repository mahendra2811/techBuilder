import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { LOCALES } from '@techbuilder/contracts';
import { ExportsService } from './exports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const SECTION_KEYS = [
  'expense',
  'money',
  'vendor',
  'attendance',
  'progress',
  'siteSummary',
  'material',
  'fleet',
  'issue',
  'people',
] as const;

const ExportEmailSchema = z.object({
  sections: z.array(z.enum(SECTION_KEYS)).min(1),
  from: BusinessDateSchema,
  to: BusinessDateSchema,
  email: z.string().email(),
  locale: z.enum(LOCALES),
});

/**
 * Excel export v2 (frozen.6). `config` is any authenticated user (feature-flag read); `email`
 * requires `report.export` (OWNER=ORG, SITE_MANAGER=OWN_SITE per shared/src/permissions.ts) —
 * the same action the RBAC matrix already reserved for this, previously unused.
 */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  // ENDPOINTS.exportConfig
  @Get('config')
  config() {
    return this.exports.config();
  }

  // ENDPOINTS.exportEmail
  @RequireAction('report.export')
  @Post('email')
  email(@CurrentUser() u: Principal, @Body(new ZodBody(ExportEmailSchema)) body: z.infer<typeof ExportEmailSchema>) {
    return this.exports.email(u, body);
  }
}
