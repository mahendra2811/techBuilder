import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateVehicleTypeInput } from '@techbuilder/contracts';
import { VehicleTypesService } from './vehicle-types.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateVehicleTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  trackingMode: z.enum(['KM', 'HOURS']),
  fieldsSchema: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(['text', 'number', 'select', 'photo']),
        required: z.boolean(),
      }),
    )
    .default([]),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('vehicle-types')
export class VehicleTypesController {
  constructor(private readonly vehicleTypes: VehicleTypesService) {}

  @RequireAction('vehicle.manage')
  @Post()
  create(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateVehicleTypeSchema)) body: CreateVehicleTypeInput,
  ) {
    return this.vehicleTypes.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.vehicleTypes.list(u);
  }
}
