import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SitesModule } from './sites/sites.module';
import { PeopleModule } from './people/people.module';
import { WageModule } from './wage/wage.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { SyncModule } from './sync/sync.module';
import { VehicleTypesModule } from './vehicle-types/vehicle-types.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { RecordsModule } from './records/records.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MediaModule } from './media/media.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TransformInterceptor } from './common/transform.interceptor';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    UsersModule,
    SitesModule,
    PeopleModule,
    VehicleTypesModule,
    VehiclesModule,
    AttendanceModule,
    LeaveModule,
    RecordsModule,
    ApprovalsModule,
    NotificationsModule,
    MediaModule,
    WageModule,
    DashboardsModule,
    ReconciliationModule,
    SyncModule,
  ],
  providers: [
    Reflector,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
