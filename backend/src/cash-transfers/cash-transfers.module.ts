import { Module } from '@nestjs/common';
import {
  CashTransfersController,
  LedgerController,
  MyBalanceController,
} from './cash-transfers.controller';
import { CashTransfersService } from './cash-transfers.service';

@Module({
  controllers: [CashTransfersController, MyBalanceController, LedgerController],
  providers: [CashTransfersService],
  exports: [CashTransfersService],
})
export class CashTransfersModule {}
