import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type {
  CreateProgressNoteInput,
  CreateExpenseInput,
  CreateFuelLogInput,
  CreateVehicleLogInput,
  CreateTripInput,
  CreateMaterialTxnInput,
  CreateIssueInput,
} from '@techbuilder/contracts';
import { RecordsService } from './records.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

// ---- Zod schemas ----

const CreateProgressNoteSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  text: z.string().min(1),
  businessDate: z.string(),
  mediaIds: z.array(z.string().uuid()).optional(),
});

const CreateExpenseSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  category: z.enum(['FOOD', 'SUPPLIES', 'TRANSPORT', 'LABOUR', 'REPAIR', 'MISC']),
  amountPaise: z.number().int(),
  vendorId: z.string().uuid().optional(),
  billNo: z.string().optional(),
  receiptMediaId: z.string().uuid().optional(),
  businessDate: z.string(),
});

const CreateFuelLogSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  amountPaise: z.number().int(),
  litres: z.number(),
  reading: z.number(),
  receiptMediaId: z.string().uuid().optional(),
  businessDate: z.string(),
});

const CreateVehicleLogSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverPersonId: z.string().uuid(),
  startReading: z.number(),
  endReading: z.number().optional(),
  businessDate: z.string(),
});

const CreateTripSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  fromText: z.string().min(1),
  toText: z.string().min(1),
  purpose: z.string().optional(),
  materialTxnId: z.string().uuid().optional(),
  businessDate: z.string(),
});

const CreateMaterialTxnSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['IN', 'CONSUME', 'DISPATCH', 'RECEIVE']),
  materialId: z.string().uuid(),
  qty: z.number(),
  uom: z.enum(['BAG', 'KG', 'CFT', 'NOS', 'MT', 'LITRE']),
  siteId: z.string().uuid(),
  counterpartSiteId: z.string().uuid().optional(),
  relatedTxnId: z.string().uuid().optional(),
  businessDate: z.string(),
});

const CreateIssueSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string().min(1),
  businessDate: z.string(),
  mediaIds: z.array(z.string().uuid()).optional(),
});

const UpdateRecordSchema = z.record(z.unknown());

// ---- Controller ----

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @RequireAction('record.enter')
  @Post('progress')
  createProgressNote(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateProgressNoteSchema)) body: CreateProgressNoteInput,
  ) {
    return this.records.createProgressNote(u, body);
  }

  @RequireAction('record.enter')
  @Post('expense')
  createExpense(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.records.createExpense(u, body);
  }

  @RequireAction('vehicleLog.enter')
  @Post('fuel')
  createFuelLog(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateFuelLogSchema)) body: CreateFuelLogInput,
  ) {
    return this.records.createFuelLog(u, body);
  }

  @RequireAction('vehicleLog.enter')
  @Post('vehicle-log')
  createVehicleLog(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateVehicleLogSchema)) body: CreateVehicleLogInput,
  ) {
    return this.records.createVehicleLog(u, body);
  }

  @RequireAction('vehicleLog.enter')
  @Post('trip')
  createTrip(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateTripSchema)) body: CreateTripInput,
  ) {
    return this.records.createTrip(u, body);
  }

  @RequireAction('record.enter')
  @Post('material-txn')
  createMaterialTxn(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateMaterialTxnSchema)) body: CreateMaterialTxnInput,
  ) {
    return this.records.createMaterialTxn(u, body);
  }

  @RequireAction('record.enter')
  @Post('issue')
  createIssue(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateIssueSchema)) body: CreateIssueInput,
  ) {
    return this.records.createIssue(u, body);
  }

  @RequireAction('record.enter')
  @Patch(':entityType/:id')
  updateRecord(
    @CurrentUser() u: Principal,
    @Param('entityType') entityType: string,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.records.updateRecord(u, entityType, id, body);
  }

  @RequireAction('record.enter')
  @Post(':entityType/:id/void')
  voidRecord(
    @CurrentUser() u: Principal,
    @Param('entityType') entityType: string,
    @Param('id') id: string,
  ) {
    return this.records.voidRecord(u, entityType, id);
  }

  @RequireAction('view.all')
  @Get(':entityType')
  listRecords(
    @CurrentUser() u: Principal,
    @Param('entityType') entityType: string,
    @Query('siteId') siteId: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.records.listRecords(u, entityType, siteId, from, to);
  }
}
