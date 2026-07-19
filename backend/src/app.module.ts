import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { CashTransfersModule } from './cash-transfers/cash-transfers.module';
import { VendorsModule } from './vendors/vendors.module';
import { InsightsModule } from './insights/insights.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MediaModule } from './media/media.module';
import { ExportsModule } from './exports/exports.module';
// Round 2 (frozen.8):
import { MaterialsModule } from './materials/materials.module';
import { FuelStockModule } from './fuel-stock/fuel-stock.module';
import { AccountantModule } from './accountant/accountant.module';
import { VehicleDocsModule } from './vehicle-docs/vehicle-docs.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TransformInterceptor } from './common/transform.interceptor';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit — a RUNAWAY/DoS backstop only, deliberately loose. The web talks to this
    // API server-to-server through the Next.js proxy, which does NOT forward the client IP, so a
    // per-IP limit is really PER-ORG (everyone shares the proxy's IP). A tight cap here throttled
    // the whole org's normal traffic (dashboards fan out many calls); 3000/min never bites real
    // use but still stops a runaway loop. Auth routes keep a tighter per-route @Throttle
    // (auth.controller.ts) to blunt credential stuffing. ThrottlerGuard is the APP_GUARD below.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 3000 }] }),
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
    CashTransfersModule,
    VendorsModule,
    InsightsModule,
    NotificationsModule,
    MediaModule,
    WageModule,
    DashboardsModule,
    ReconciliationModule,
    SyncModule,
    ExportsModule,
    // Round 2 (frozen.8):
    MaterialsModule,
    FuelStockModule,
    AccountantModule,
    VehicleDocsModule,
    ComplaintsModule,
  ],
  providers: [
    Reflector,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
