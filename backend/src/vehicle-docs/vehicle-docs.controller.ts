import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { REMINDER_KINDS, REMINDER_RECURRENCES, VEHICLE_DOC_KINDS } from '@techbuilder/contracts';
import type {
  CreateVehicleDocumentInput,
  CreateVehicleReminderInput,
  UpdateVehicleDocumentInput,
  UpdateVehicleReminderInput,
} from '@techbuilder/contracts';
import { VehicleDocsService } from './vehicle-docs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateVehicleDocumentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(VEHICLE_DOC_KINDS),
  title: z.string().min(1),
  mediaId: z.string().uuid().optional(),
  expiryDate: BusinessDateSchema.optional(),
  note: z.string().optional(),
});

const UpdateVehicleDocumentSchema = z.object({
  kind: z.enum(VEHICLE_DOC_KINDS).optional(),
  title: z.string().min(1).optional(),
  mediaId: z.string().uuid().nullable().optional(),
  expiryDate: BusinessDateSchema.nullable().optional(),
  note: z.string().nullable().optional(),
});

const CreateVehicleReminderSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  label: z.string().min(1),
  kind: z.enum(REMINDER_KINDS),
  dueDate: BusinessDateSchema,
  recurrence: z.enum(REMINDER_RECURRENCES).optional(),
  remindDaysBefore: z.number().int().min(0).max(365).optional(),
});

const UpdateVehicleReminderSchema = z.object({
  label: z.string().min(1).optional(),
  dueDate: BusinessDateSchema.optional(),
  recurrence: z.enum(REMINDER_RECURRENCES).optional(),
  remindDaysBefore: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
});

/**
 * CW-12 — routes match `shared/src/api.ts` ENDPOINTS exactly.
 * `@RequireAction('vehicle.manage')` gates every route (only OWNER=ORG / SITE_MANAGER=OWN_SITE
 * hold that action per the permissions matrix — ACCOUNTANT/SUPERVISOR/DRIVER/WORKER get a
 * FORBIDDEN from the guard before they ever reach the service). The service re-derives role +
 * site scope fresh from the DB on every call (see VehicleDocsService) — the guard is not relied
 * on alone.
 */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class VehicleDocsController {
  constructor(private readonly vehicleDocs: VehicleDocsService) {}

  @RequireAction('vehicle.manage')
  @Get('vehicles/:id/docs')
  listDocs(@CurrentUser() u: Principal, @Param('id') vehicleId: string) {
    return this.vehicleDocs.listDocs(u, vehicleId);
  }

  @RequireAction('vehicle.manage')
  @Post('vehicles/:id/docs')
  createDoc(
    @CurrentUser() u: Principal,
    @Param('id') vehicleId: string,
    @Body(new ZodBody(CreateVehicleDocumentSchema)) body: CreateVehicleDocumentInput,
  ) {
    return this.vehicleDocs.createDoc(u, vehicleId, body);
  }

  @RequireAction('vehicle.manage')
  @Patch('vehicle-docs/:id')
  updateDoc(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateVehicleDocumentSchema)) body: UpdateVehicleDocumentInput,
  ) {
    return this.vehicleDocs.updateDoc(u, id, body);
  }

  @RequireAction('vehicle.manage')
  @Delete('vehicle-docs/:id')
  deleteDoc(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.vehicleDocs.deleteDoc(u, id);
  }

  @RequireAction('vehicle.manage')
  @Get('vehicles/:id/reminders')
  listReminders(@CurrentUser() u: Principal, @Param('id') vehicleId: string) {
    return this.vehicleDocs.listReminders(u, vehicleId);
  }

  @RequireAction('vehicle.manage')
  @Post('vehicles/:id/reminders')
  createReminder(
    @CurrentUser() u: Principal,
    @Param('id') vehicleId: string,
    @Body(new ZodBody(CreateVehicleReminderSchema)) body: CreateVehicleReminderInput,
  ) {
    return this.vehicleDocs.createReminder(u, vehicleId, body);
  }

  @RequireAction('vehicle.manage')
  @Patch('vehicle-reminders/:id')
  updateReminder(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateVehicleReminderSchema)) body: UpdateVehicleReminderInput,
  ) {
    return this.vehicleDocs.updateReminder(u, id, body);
  }

  @RequireAction('vehicle.manage')
  @Delete('vehicle-reminders/:id')
  deleteReminder(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.vehicleDocs.deleteReminder(u, id);
  }
}
