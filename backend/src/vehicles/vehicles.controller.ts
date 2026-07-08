import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateVehicleInput } from '@techbuilder/contracts';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateVehicleSchema = z.object({
  id: z.string().uuid(),
  vehicleTypeId: z.string().uuid(),
  regNo: z.string().min(1),
  name: z.string().optional(),
  values: z.record(z.unknown()).optional(),
  assignedSiteId: z.string().uuid().optional(),
  assignedDriverPersonId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'IDLE', 'MAINTENANCE']).optional(),
  docs: z
    .array(
      z.object({
        kind: z.enum(['RC', 'INSURANCE', 'PUC', 'FITNESS', 'PERMIT']),
        mediaId: z.string().uuid().optional(),
        expiry: z.string().optional(),
      }),
    )
    .optional(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @RequireAction('vehicle.manage')
  @Post()
  create(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateVehicleSchema)) body: CreateVehicleInput,
  ) {
    return this.vehicles.create(u, body);
  }

  @RequireAction('view.all')
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.vehicles.list(u);
  }

  // WO-7: driver dashboard vehicle card (own vehicle only — see VehiclesService.mySnapshot).
  @RequireAction('vehicleLog.enter')
  @Get('my-snapshot')
  mySnapshot(@CurrentUser() u: Principal) {
    return this.vehicles.mySnapshot(u);
  }

  // WO-11: driver self-switch onto another vehicle of an allowed type (no body — target is the
  // route param). Same action as vehicleLog.enter (DRIVER=OWN_VEHICLE); the service enforces
  // DRIVER-only + the allowed-types check.
  @RequireAction('vehicleLog.enter')
  @Post(':id/switch')
  selfSwitch(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.vehicles.selfSwitch(u, id);
  }

  // WO-12: fleet drill-down (SM own-site / OWNER any — service-enforced, like vendors).
  @RequireAction('view.all')
  @Get(':id/detail')
  detail(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.vehicles.detail(u, id);
  }
}
