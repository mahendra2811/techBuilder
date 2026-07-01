import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { MarkAttendanceInput } from '@techbuilder/contracts';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const MarkAttendanceSchema = z.object({
  siteId: z.string().uuid(),
  crewId: z.string().uuid().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        id: z.string().uuid(),
        personId: z.string().uuid(),
        status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY']),
        otHours: z.number().optional(),
      }),
    )
    .min(1),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @RequireAction('attendance.mark')
  @Post()
  mark(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(MarkAttendanceSchema)) body: MarkAttendanceInput,
  ) {
    return this.attendance.mark(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(
    @CurrentUser() u: Principal,
    @Query('siteId') siteId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.attendance.list(u, siteId, from, to);
  }
}
