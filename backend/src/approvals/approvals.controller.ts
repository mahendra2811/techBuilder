import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { APPROVAL_TYPES, EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type { SubmitRequestInput, DecideRequestInput, ApprovalStatus } from '@techbuilder/contracts';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const SubmitRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(APPROVAL_TYPES),
  payload: z.record(z.string(), z.unknown()),
});

const DecideRequestSchema = z.object({
  approve: z.boolean(),
  comment: z.string().optional(),
  /** EXPENSE_ADD only: decider's final category ("the approver creates the final expense"). */
  categoryOverride: z.enum(EXPENSE_CATEGORIES).optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('requests')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @RequireAction('request.submit')
  @Post()
  submitRequest(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(SubmitRequestSchema)) body: SubmitRequestInput,
  ) {
    return this.approvals.submitRequest(u, body);
  }

  @RequireAction('request.decide')
  @Post(':id/decide')
  decideRequest(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(DecideRequestSchema)) body: DecideRequestInput,
  ) {
    return this.approvals.decideRequest(u, id, body);
  }

  @RequireAction('view.all')
  @Get()
  listRequests(
    @CurrentUser() u: Principal,
    @Query('status') status?: ApprovalStatus,
  ) {
    return this.approvals.listRequests(u, status);
  }
}
