import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { MaterialTypeConfigSchema, UOMS } from '@techbuilder/contracts';
import type { CreateMaterialInput, UpdateMaterialInput } from '@techbuilder/contracts';
import { MaterialsService } from './materials.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateMaterialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  uom: z.enum(UOMS),
  config: MaterialTypeConfigSchema.optional(),
});

const UpdateMaterialSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: MaterialTypeConfigSchema.optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  // No @RequireAction: there is no dedicated ACTIONS entry for catalog management (same
  // reasoning as SitesController.updateConfig, WO-8) — the service enforces
  // SITE_MANAGER/OWNER fresh from the DB.
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateMaterialSchema)) body: CreateMaterialInput) {
    return this.materials.create(u, body);
  }

  // Every role holds `view.all` at SOME scope (Spec §4 matrix) — this decorator is
  // effectively "any authenticated user", which is what supervisor/driver pickers need.
  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.materials.list(u);
  }

  // No @RequireAction — same reasoning as create.
  @Patch(':id')
  update(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateMaterialSchema)) body: UpdateMaterialInput,
  ) {
    return this.materials.update(u, id, body);
  }
}
