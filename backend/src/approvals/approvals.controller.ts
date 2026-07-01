import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { SubmitRequestInput, DecideRequestInput, ApprovalStatus } from '@techbuilder/contracts';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const SubmitRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['VEHICLE_SWITCH', 'LEAVE', 'MATERIAL']),
  payload: z.record(z.string(), z.unknown()),
});

const DecideRequestSchema = z.object({
  approve: z.boolean(),
  comment: z.string().optional(),
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
