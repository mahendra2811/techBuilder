import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ROLES, type CreateUserInput } from '@techbuilder/contracts';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateUserSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid().optional(),
  name: z.string().min(1),
  username: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(ROLES),
  assignedSiteId: z.string().uuid().optional(),
  crewId: z.string().uuid().optional(),
  allowedVehicleTypeIds: z.array(z.string().uuid()).optional(),
  emergencyContact: z.string().optional(),
  tempPassword: z.string().min(8),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequireAction('user.create')
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateUserSchema)) body: CreateUserInput) {
    return this.users.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.users.list(u);
  }

  @RequireAction('user.create')
  @Post(':id/deactivate')
  async deactivate(@CurrentUser() u: Principal, @Param('id') id: string): Promise<{ ok: true }> {
    await this.users.deactivate(u, id);
    return { ok: true };
  }
}
