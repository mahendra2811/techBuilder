import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreatePersonInput } from '@techbuilder/contracts';
import { PeopleService } from './people.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreatePersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().optional(),
  skill: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'OPERATOR', 'DRIVER']).optional(),
  defaultWagePaise: z.number().int().optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @RequireAction('user.create')
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreatePersonSchema)) body: CreatePersonInput) {
    return this.people.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.people.list(u);
  }
}
