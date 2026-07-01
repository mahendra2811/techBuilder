import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateSiteInput } from '@techbuilder/contracts';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateSiteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).optional(),
  weeklyOff: z.array(z.number().int().min(0).max(6)).optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  budgetPaise: z.number().int().optional(),
  siteManagerId: z.string().uuid().optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @RequireAction('site.manage')
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateSiteSchema)) body: CreateSiteInput) {
    return this.sites.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.sites.list(u);
  }

  @RequireAction('view.all')
  @Get(':id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.sites.get(u, id);
  }
}
