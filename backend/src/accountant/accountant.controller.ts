import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountantService } from './accountant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

/** ENDPOINTS.accountantQueue — the accountant's work queue (service narrows to ACCOUNTANT/OWNER). */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('accountant')
export class AccountantController {
  constructor(private readonly accountant: AccountantService) {}

  @RequireAction('request.decide')
  @Get('queue')
  queue(@CurrentUser() u: Principal) {
    return this.accountant.queue(u);
  }
}
