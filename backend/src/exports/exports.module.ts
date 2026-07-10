import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { RecordsModule } from '../records/records.module';
import { CashTransfersModule } from '../cash-transfers/cash-transfers.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { PeopleModule } from '../people/people.module';
import { UsersModule } from '../users/users.module';
import { SitesModule } from '../sites/sites.module';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [
    RecordsModule,
    CashTransfersModule,
    VendorsModule,
    AttendanceModule,
    PeopleModule,
    UsersModule,
    SitesModule,
    VehiclesModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
