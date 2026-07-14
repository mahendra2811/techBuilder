import { Module } from '@nestjs/common';
import { AccountantController } from './accountant.controller';
import { AccountantService } from './accountant.service';
import { CashTransfersModule } from '../cash-transfers/cash-transfers.module';
import { FuelStockModule } from '../fuel-stock/fuel-stock.module';

@Module({
  imports: [CashTransfersModule, FuelStockModule],
  controllers: [AccountantController],
  providers: [AccountantService],
})
export class AccountantModule {}
