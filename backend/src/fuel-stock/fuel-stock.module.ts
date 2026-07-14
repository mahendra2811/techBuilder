import { Module } from '@nestjs/common';
import { FuelStockController } from './fuel-stock.controller';
import { FuelStockService } from './fuel-stock.service';

@Module({
  controllers: [FuelStockController],
  providers: [FuelStockService],
  exports: [FuelStockService],
})
export class FuelStockModule {}
