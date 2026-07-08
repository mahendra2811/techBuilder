import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CASH_TRANSFER_KINDS } from '@techbuilder/contracts';
import type { CreateCashTransferInput } from '@techbuilder/contracts';
import { CashTransfersService } from './cash-transfers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';

const CreateCashTransferSchema = z.object({
  id: z.string().uuid(),
  toUserId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  kind: z.enum(CASH_TRANSFER_KINDS),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
});

/**
 * WO-9 cash ledger. NO @RequireAction anywhere — any authenticated user may hit these routes;
 * the service enforces the chain (rank) + scope (site/crew) rules and who may read the rollup.
 */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('cash-transfers')
export class CashTransfersController {
  constructor(private readonly cash: CashTransfersService) {}

  // ENDPOINTS.cashTransferCreate
  @Post()
  create(@CurrentUser() u: Principal, @Body(new ZodBody(CreateCashTransferSchema)) body: CreateCashTransferInput) {
    return this.cash.create(u, body);
  }

  // ENDPOINTS.cashTransfersList
  @Get()
  list(@CurrentUser() u: Principal) {
    return this.cash.list(u);
  }
}

/** ENDPOINTS.myBalance = GET /me/balance (self-scoped khata). */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('me')
export class MyBalanceController {
  constructor(private readonly cash: CashTransfersService) {}

  @Get('balance')
  myBalance(@CurrentUser() u: Principal) {
    return this.cash.myBalance(u);
  }
}

/** ENDPOINTS.ledgerRollup = GET /ledger/rollup (OWNER / SITE_MANAGER only — service-enforced). */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly cash: CashTransfersService) {}

  @Get('rollup')
  rollup(@CurrentUser() u: Principal) {
    return this.cash.rollup(u);
  }
}
