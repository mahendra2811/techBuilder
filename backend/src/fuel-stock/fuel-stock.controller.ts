import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { CreateFuelIssuanceInput, CreateFuelStockPurchaseInput } from '@techbuilder/contracts';
import { FuelStockService } from './fuel-stock.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CreatePurchaseSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  litres: z.number().positive(),
  amountPaise: z.number().int().positive().optional(),
  receiptMediaId: z.string().uuid().optional(),
  businessDate: BusinessDateSchema,
  note: z.string().max(2000).optional(),
});

const CreateIssuanceSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid().optional(), // derived from the vehicle when omitted
  vehicleId: z.string().uuid(),
  litres: z.number().positive(),
  businessDate: BusinessDateSchema,
  note: z.string().max(2000).optional(),
});

/** Round 2 (C7) — diesel stock, issuances and the 🚩 match-flag read. Writes: supervisor/SM
 *  (record.enter); reads: view.all with service-side narrowing (flags → accountant/SM/Owner). */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('fuel-stock')
export class FuelStockController {
  constructor(private readonly fuel: FuelStockService) {}

  // ENDPOINTS.fuelStockCreate
  @RequireAction('record.enter')
  @Post('purchases')
  createPurchase(@CurrentUser() u: Principal, @Body(new ZodBody(CreatePurchaseSchema)) body: CreateFuelStockPurchaseInput) {
    return this.fuel.createPurchase(u, body);
  }

  // ENDPOINTS.fuelStockList
  @RequireAction('view.all')
  @Get('purchases')
  listPurchases(@CurrentUser() u: Principal, @Query('siteId') siteId?: string) {
    return this.fuel.listPurchases(u, siteId);
  }

  // ENDPOINTS.fuelIssuanceCreate
  @RequireAction('record.enter')
  @Post('issuances')
  createIssuance(@CurrentUser() u: Principal, @Body(new ZodBody(CreateIssuanceSchema)) body: CreateFuelIssuanceInput) {
    return this.fuel.createIssuance(u, body);
  }

  // ENDPOINTS.fuelIssuancesList
  @RequireAction('view.all')
  @Get('issuances')
  listIssuances(@CurrentUser() u: Principal, @Query('siteId') siteId?: string, @Query('vehicleId') vehicleId?: string) {
    return this.fuel.listIssuances(u, siteId, vehicleId);
  }

  // ENDPOINTS.fuelMatchFlags — 🚩 accountant / SM / Owner (service-narrowed)
  @RequireAction('view.all')
  @Get('flags')
  matchFlags(@CurrentUser() u: Principal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.fuel.matchFlags(u, from, to);
  }
}
