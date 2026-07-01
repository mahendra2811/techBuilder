import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateAdvanceInput, SetWageRateInput } from '@techbuilder/contracts';
import { WageService } from './wage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const SetWageRateSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  dailyPaise: z.number().int().nonnegative(),
  effectiveFrom: z.string(),
});
const CreateAdvanceSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid().optional(),
  crewId: z.string().uuid().optional(),
  amountPaise: z.number().int(),
  businessDate: z.string(),
  note: z.string().optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class WageController {
  constructor(private readonly wage: WageService) {}

  @RequireAction('config.manage')
  @Post('wage-rates')
  setWageRate(@CurrentUser() u: Principal, @Body(new ZodBody(SetWageRateSchema)) body: SetWageRateInput) {
    return this.wage.setWageRate(u, body);
  }

  @RequireAction('wage.view')
  @Post('advances')
  createAdvance(@CurrentUser() u: Principal, @Body(new ZodBody(CreateAdvanceSchema)) body: CreateAdvanceInput) {
    return this.wage.createAdvance(u, body);
  }

  @RequireAction('wage.view')
  @Get('reports/wage-summary')
  wageSummary(@CurrentUser() u: Principal, @Query('from') from: string, @Query('to') to: string) {
    return this.wage.getWageSummary(u, { from, to });
  }
}
