import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class DashboardsController {
  constructor(private readonly dash: DashboardsService) {}

  @RequireAction('view.all')
  @Get('dashboards/owner')
  owner(@CurrentUser() u: Principal, @Query('from') from: string, @Query('to') to: string) {
    return this.dash.getOwnerDashboard(u, { from, to });
  }

  @RequireAction('view.all')
  @Get('completeness')
  completeness(@CurrentUser() u: Principal, @Query('from') from: string, @Query('to') to: string) {
    return this.dash.getCompleteness(u, { from, to });
  }
}
