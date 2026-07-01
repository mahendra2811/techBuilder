import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/rbac.guard';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // No @RequireAction — any authenticated user may fetch their own notifications
  @Get()
  listNotifications(@CurrentUser() u: Principal) {
    return this.notifications.listNotifications(u);
  }

  // No @RequireAction — any authenticated user may mark their own notification read
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/read')
  markNotificationRead(@CurrentUser() u: Principal, @Param('id') id: string): Promise<void> {
    return this.notifications.markNotificationRead(u, id);
  }
}
