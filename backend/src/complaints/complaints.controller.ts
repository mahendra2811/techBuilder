import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { COMPLAINT_TARGETS, ISSUE_STATUSES } from '@techbuilder/contracts';
import type { CreateComplaintInput, IssueStatus } from '@techbuilder/contracts';
import { ComplaintsService } from './complaints.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateComplaintSchema = z.object({
  id: z.string().uuid(),
  target: z.enum(COMPLAINT_TARGETS),
  text: z.string().min(1),
  mediaIds: z.array(z.string().uuid()).optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  // No @RequireAction: raisers are WORKER/DRIVER/SUPERVISOR/ACCOUNTANT — no single fixed RBAC
  // action covers exactly that set (WORKER/DRIVER/SUPERVISOR hold request.submit but ACCOUNTANT
  // does not — same bug class as records.createIssue). The service enforces the role allowlist.
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateComplaintSchema)) body: CreateComplaintInput) {
    return this.complaints.create(u, body);
  }

  // Every role that can reach this route holds view.all at some scope; the service narrows the
  // actual rows returned (own-raised / SM-addressed-on-my-sites / everything for the Owner).
  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal, @Query('status') status?: string) {
    const parsed = ISSUE_STATUSES.find((s) => s === status) as IssueStatus | undefined;
    return this.complaints.list(u, parsed);
  }

  // No @RequireAction: only OWNER (any) / SITE_MANAGER (own-site, SM-addressed) may resolve —
  // the service enforces that; a fixed decorator has no action that maps to exactly this pair.
  @Post(':id/resolve')
  resolve(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.complaints.resolve(u, id);
  }
}
