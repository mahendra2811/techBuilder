import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reports')
export class ReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @RequireAction('view.all')
  @Get('reconciliation')
  reconciliation(@CurrentUser() u: Principal, @Query('from') from: string, @Query('to') to: string) {
    return this.recon.getReconciliation(u, { from, to });
  }
}
