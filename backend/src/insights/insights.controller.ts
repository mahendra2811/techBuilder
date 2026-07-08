import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

/**
 * WO-13 insights — read-only date-wise rollups (day / period / person). `@RequireAction('view.all')`
 * gates entry (every role except WORKER/DRIVER holds SOME view.all scope); the service is
 * authoritative on the finer WORKER/DRIVER-forbidden + site/crew/person scope rules.
 */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  // ENDPOINTS.insightsDay
  @RequireAction('view.all')
  @Get('day')
  day(@CurrentUser() u: Principal, @Query('siteId') siteId: string | undefined, @Query('date') date: string | undefined) {
    return this.insights.getDayInsights(u, siteId, date);
  }

  // ENDPOINTS.insightsPeriod
  @RequireAction('view.all')
  @Get('period')
  period(
    @CurrentUser() u: Principal,
    @Query('siteId') siteId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ) {
    return this.insights.getPeriodInsights(u, siteId, from, to);
  }

  // ENDPOINTS.insightsPerson
  @RequireAction('view.all')
  @Get('person/:id')
  person(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ) {
    return this.insights.getPersonInsights(u, id, from, to);
  }
}
