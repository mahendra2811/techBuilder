import { Module } from '@nestjs/common';
import { VehicleDocsController } from './vehicle-docs.controller';
import { VehicleDocsService } from './vehicle-docs.service';

@Module({
  controllers: [VehicleDocsController],
  providers: [VehicleDocsService],
  exports: [VehicleDocsService],
})
export class VehicleDocsModule {}
