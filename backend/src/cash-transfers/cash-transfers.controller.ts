import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CASH_TRANSFER_KINDS, MONEY_TAGS } from '@techbuilder/contracts';
import type { CreateCashTransferInput, VerifyInput } from '@techbuilder/contracts';
import { CashTransfersService } from './cash-transfers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequireAction } from '../common/rbac.guard';
import { ZodBody } from '../common/zod-body.pipe';
import { CurrentUser, type Principal } from '../common/current-user.decorator';
import { VerifySchema } from '../approvals/approvals.controller';

const CreateCashTransferSchema = z.object({
  id: z.string().uuid(),
  toUserId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  kind: z.enum(CASH_TRANSFER_KINDS),
  /** Round 2: WORK (default) khata advance · SALARY/PERSONAL personal draw (three-giver rule). */
  tag: z.enum(MONEY_TAGS).optional(),
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

  // ENDPOINTS.cashTransfersList (frozen.10: + tag/kind slice filters for the khata sub-pages)
  @Get()
  list(
    @CurrentUser() u: Principal,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tag') tag?: string,
    @Query('kind') kind?: string,
  ) {
    return this.cash.list(u, { limit, from, to, tag, kind });
  }

  // ENDPOINTS.cashTransferVerify — Round 2 two-tick (site accountant / Owner; service-narrowed).
  @RequireAction('request.decide')
  @Post(':id/verify')
  verify(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Body(new ZodBody(VerifySchema)) body: VerifyInput,
  ) {
    return this.cash.verifyTransfer(u, id, body);
  }
}

/** ENDPOINTS.myBalance = GET /me/balance (self-scoped khata) · ENDPOINTS.myMoney = GET /me/money. */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('me')
export class MyBalanceController {
  constructor(private readonly cash: CashTransfersService) {}

  @Get('balance')
  myBalance(@CurrentUser() u: Principal) {
    return this.cash.myBalance(u);
  }

  // Round 2 (C10): "money I've taken" — the caller's own verified SALARY/PERSONAL draws.
  @Get('money')
  myMoney(@CurrentUser() u: Principal) {
    return this.cash.myMoney(u);
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

/** ENDPOINTS.userMoney = GET /users/:id/money (frozen.9) — upper-role view of a subordinate's
 *  money-taken history. view.all reaches the route; the service narrows to Owner/SM/Accountant
 *  (site-scoped) or self. */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('users')
export class UserMoneyController {
  constructor(private readonly cash: CashTransfersService) {}

  @RequireAction('view.all')
  @Get(':id/money')
  userMoney(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cash.userMoney(u, id);
  }
}
