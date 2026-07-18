import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@techbuilder/contracts';
import type {
  CreateProgressNoteInput,
  CreateExpenseInput,
  CreateFuelLogInput,
  CreateVehicleLogInput,
  CreateTripInput,
  CreateMaterialTxnInput,
  CreateIssueInput,
  ResolveIssueInput,
  CloseIssueInput,
  VerifyInput,
} from '@techbuilder/contracts';
import { VerifySchema } from '../approvals/approvals.controller';
import { RecordsService } from './records.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

// ---- Zod schemas ----

// A malformed date string would make daysBetween() return NaN and silently DISABLE the
// backdate-window guard (NaN comparisons are all false) — so every schema pins the shape.
const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreateProgressNoteSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  text: z.string().min(1),
  businessDate: BusinessDateSchema,
  mediaIds: z.array(z.string().uuid()).optional(),
});

const CreateExpenseSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  category: z.enum(EXPENSE_CATEGORIES),
  subcategory: z.string().max(40).optional(), // frozen.10 (SM-2): config-driven subcategory key
  amountPaise: z.number().int(),
  vendorId: z.string().uuid().optional(),
  billNo: z.string().max(120).optional(),
  receiptMediaId: z.string().uuid().optional(),
  paidVia: z.enum(PAYMENT_MODES).optional(), // WO-0: CASH (default) | VENDOR_CREDIT
  remark: z.string().max(2000).optional(), // frozen.4
  businessDate: BusinessDateSchema,
});

const CreateFuelLogSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  amountPaise: z.number().int().positive().optional(), // frozen.10 (DRV-4): omitted = from store/khata
  paidByDriver: z.boolean().optional(),
  litres: z.number(),
  reading: z.number(),
  receiptMediaId: z.string().uuid().optional(),
  businessDate: BusinessDateSchema,
});

const CreateVehicleLogSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverPersonId: z.string().uuid(),
  startReading: z.number(),
  endReading: z.number().optional(),
  hoursWorked: z.number().nonnegative().optional(), // WO-0/D-3: driver evening update
  loadsCount: z.number().int().nonnegative().optional(),
  note: z.string().max(2000).optional(),
  businessDate: BusinessDateSchema,
});

const CreateTripSchema = z.object({
  id: z.string().uuid(),
  vehicleId: z.string().uuid(),
  fromText: z.string().min(1),
  toText: z.string().min(1),
  purpose: z.string().max(500).optional(),
  materialTxnId: z.string().uuid().optional(),
  businessDate: BusinessDateSchema,
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
  businessDate: BusinessDateSchema,
  remark: z.string().max(2000).optional(), // frozen.10 (SUP-4): required by the UI for the "Other" material
});

const CreateIssueSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string().min(1),
  businessDate: BusinessDateSchema,
  mediaIds: z.array(z.string().uuid()).optional(),
});

const ResolveIssueSchema = z.object({
  resolutionNote: z.string().min(1),
});

const CloseIssueSchema = z.object({
  closingNote: z.string().max(2000).optional(),
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

  // No @RequireAction: Round 2 (CW-8) DRIVERS may submit a data-only PICK for
  // driverPicks-enabled material types under vehicleLog.enter — they never hold
  // record.enter (same bug class as createIssue below: a fixed decorator would 403
  // every driver pick). The service branches by role: driver → vehicleLog.enter +
  // per-type driverPicks check; everyone else → record.enter as before.
  @Post('material-txn')
  createMaterialTxn(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateMaterialTxnSchema)) body: CreateMaterialTxnInput,
  ) {
    return this.records.createMaterialTxn(u, body);
  }

  // No @RequireAction: DRIVERS file vehicle-damage issues under vehicleLog.enter (they never
  // hold record.enter), so a fixed decorator would 403 every driver damage report (QA bug).
  // The service branches by role: driver → own-vehicle only; others → record.enter as before.
  @Post('issue')
  createIssue(
    @CurrentUser() u: Principal,
    @Body(new ZodBody(CreateIssueSchema)) body: CreateIssueInput,
  ) {
    return this.records.createIssue(u, body);
  }

  // WO-11/WO-12 damage lifecycle. No @RequireAction: OWNER has no `record.enter` scope in the
  // RBAC matrix (only SM=OWN_SITE / TH=OWN_CREW do), so a fixed decorator would wrongly lock the
  // Owner out of resolving/closing — the service enforces role + site/vehicle-site scope +
  // creator-only, same reasoning as updateRecord/voidRecord just below.
  @Post('issue/:id/resolve')
  resolveIssue(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(ResolveIssueSchema)) body: ResolveIssueInput,
  ) {
    return this.records.resolveIssue(u, id, body);
  }

  @Post('issue/:id/close')
  closeIssue(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(CloseIssueSchema)) body: CloseIssueInput,
  ) {
    return this.records.closeIssue(u, id, body);
  }

  // ENDPOINTS.expenseVerify — Round 2 two-tick. Coarse gate: request.decide; the service narrows
  // to the site's ACCOUNTANT / Owner. Declared before the generic :entityType routes on purpose.
  @RequireAction('request.decide')
  @Post('expense/:id/verify')
  verifyExpense(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(VerifySchema)) body: VerifyInput,
  ) {
    return this.records.verifyExpense(u, id, body);
  }

  // No @RequireAction here: the action depends on the entity family (fuel/vehicle-log/trip →
  // vehicleLog.enter, else record.enter). The service enforces action + creator + edit-window
  // (WP-3) — a fixed decorator would wrongly deny drivers editing their own fuel logs.
  @Patch(':entityType/:id')
  updateRecord(
    @CurrentUser() u: Principal,
    @Param('entityType') entityType: string,
    @Param('id') id: string,
    @Body(new ZodBody(UpdateRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.records.updateRecord(u, entityType, id, body);
  }

  // No @RequireAction — same reason as updateRecord; WP-3 guard in the service is authoritative.
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
