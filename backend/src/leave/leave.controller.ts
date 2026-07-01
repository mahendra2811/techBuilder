import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateLeaveInput } from '@techbuilder/contracts';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateLeaveSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['CASUAL', 'SICK', 'UNPAID', 'OTHER']),
  reason: z.string().optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @RequireAction('attendance.mark')
  @Post()
  create(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateLeaveSchema)) body: CreateLeaveInput,
  ) {
    return this.leave.create(u, body);
  }
}
