import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { uuidv7 } from 'uuidv7';
import * as schema from '@techbuilder/contracts/db/schema';
import type {
  Attendance,
  Expense,
  FuelLog,
  Issue,
  Locale,
  MaterialTxn,
  ProgressNote,
  Trip,
  VehicleLog,
  VendorLedger,
} from '@techbuilder/contracts';
import { DbService } from '../db/db.service';
import { loadEnv } from '../config/env';
import type { Principal } from '../common/current-user.decorator';
import { RecordsService } from '../records/records.service';
import { CashTransfersService } from '../cash-transfers/cash-transfers.service';
import { VendorsService } from '../vendors/vendors.service';
import { AttendanceService } from '../attendance/attendance.service';
import { PeopleService } from '../people/people.service';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { buildExportWorkbook, type ExportData, type ExportSectionKey } from './export-sheets';

export interface ExportEmailInput {
  sections: ExportSectionKey[];
  from: string;
  to: string;
  email: string;
  locale: Locale;
}

/** Typed wrapper over RecordsService.listRecords (which returns Promise<unknown[]> — the
 * entityType string picks the shape at the call site, same as the web client's api<T>()). */
async function listTyped<T>(
  records: RecordsService,
  p: Principal,
  entityType: string,
  from: string,
  to: string,
): Promise<T[]> {
  return (await records.listRecords(p, entityType, undefined, from, to)) as T[];
}

/**
 * WO — Excel export v2 email delivery. Builds the workbook server-side (survives tab close,
 * no browser cap) by delegating EVERY read to the existing, already-RBAC/scope-enforcing
 * services — this service never queries the DB directly.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly dbs: DbService,
    private readonly records: RecordsService,
    private readonly cash: CashTransfersService,
    private readonly vendors: VendorsService,
    private readonly attendance: AttendanceService,
    private readonly people: PeopleService,
    private readonly users: UsersService,
    private readonly sites: SitesService,
    private readonly vehicles: VehiclesService,
  ) {}

  config(): { emailEnabled: boolean } {
    const env = loadEnv();
    return { emailEnabled: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM) };
  }

  /** Kicks off the build+send in the background; the caller gets an immediate 202. */
  email(p: Principal, input: ExportEmailInput): { accepted: true } {
    void this.buildAndSend(p, input);
    return { accepted: true };
  }

  private async buildAndSend(p: Principal, input: ExportEmailInput): Promise<void> {
    try {
      const data = await this.gather(p, input);
      const wb = await buildExportWorkbook(input.sections, data, input.locale);
      const buffer = await wb.xlsx.writeBuffer();
      await this.sendMail(input.email, `techbuilder-${input.from}-${input.to}.xlsx`, Buffer.from(buffer));
      await this.notify(p, true, input);
    } catch (err) {
      await this.notify(p, false, input, err);
    }
  }

  private async gather(p: Principal, input: ExportEmailInput): Promise<ExportData> {
    const need = (k: ExportSectionKey) => input.sections.includes(k);
    const needsAttendance = need('attendance') || need('siteSummary');
    const needsExpense = need('expense') || need('siteSummary');
    const needsProgress = need('progress') || need('siteSummary');
    const needsIssue = need('issue') || need('siteSummary');
    const needsFuel = need('fleet') || need('siteSummary');
    const needsVendorLookup = need('vendor') || need('expense');

    const [sitesList, usersList, peopleList, vehiclesList] = await Promise.all([
      this.sites.list(p),
      this.users.list(p),
      this.people.list(p),
      this.vehicles.list(p),
    ]);

    const [expenses, progress, materials, fuel, vehicleLogs, trips, issues] = await Promise.all([
      needsExpense ? listTyped<Expense>(this.records, p, 'expense', input.from, input.to) : Promise.resolve([]),
      needsProgress ? listTyped<ProgressNote>(this.records, p, 'progress', input.from, input.to) : Promise.resolve([]),
      need('material') ? listTyped<MaterialTxn>(this.records, p, 'material-txn', input.from, input.to) : Promise.resolve([]),
      needsFuel ? listTyped<FuelLog>(this.records, p, 'fuel', input.from, input.to) : Promise.resolve([]),
      need('fleet') ? listTyped<VehicleLog>(this.records, p, 'vehicle-log', input.from, input.to) : Promise.resolve([]),
      need('fleet') ? listTyped<Trip>(this.records, p, 'trip', input.from, input.to) : Promise.resolve([]),
      needsIssue ? listTyped<Issue>(this.records, p, 'issue', input.from, input.to) : Promise.resolve([]),
    ]);

    const attendance: Attendance[] = needsAttendance
      ? (await Promise.all(sitesList.map((s) => this.attendance.list(p, s.id, input.from, input.to)))).flat()
      : [];

    const [cashTransfers, ledgerRollup] = need('money')
      ? await Promise.all([this.cash.list(p, { from: input.from, to: input.to, limit: '5000' }), this.cash.rollup(p)])
      : [[], []];

    const vendorsList = needsVendorLookup ? await this.vendors.list(p) : [];
    const vendorLedgers = new Map<string, VendorLedger>();
    if (need('vendor')) {
      const ledgers = await Promise.all(vendorsList.map((v) => this.vendors.ledger(p, v.id)));
      vendorsList.forEach((v, i) => vendorLedgers.set(v.id, ledgers[i] as VendorLedger));
    }

    return {
      sites: sitesList,
      users: usersList,
      people: peopleList,
      vehicles: vehiclesList,
      expenses,
      progress,
      materials,
      fuel,
      vehicleLogs,
      trips,
      issues,
      attendance,
      cashTransfers,
      ledgerRollup,
      vendors: vendorsList,
      vendorLedgers,
    };
  }

  private async sendMail(to: string, fileName: string, buffer: Buffer): Promise<void> {
    const env = loadEnv();
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // A hung SMTP connection would otherwise block this background job indefinitely.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Your techBuilder export',
      text: 'Your requested Excel export is attached.',
      attachments: [{ filename: fileName, content: buffer }],
    });
  }

  /** Reuses the DAILY_DIGEST notification type — no new enum value, no migration, and it is
   * already the closest existing semantic fit ("here is an informational summary for you"). */
  private async notify(p: Principal, ok: boolean, input: ExportEmailInput, err?: unknown): Promise<void> {
    await this.dbs.runInTenant(p.orgId, async (tx) => {
      await tx.insert(schema.notifications).values({
        id: uuidv7(),
        orgId: p.orgId,
        userId: p.userId,
        type: 'DAILY_DIGEST',
        payload: {
          kind: 'EXPORT',
          ok,
          sections: input.sections,
          from: input.from,
          to: input.to,
          email: input.email,
          error: ok ? undefined : String(err),
        },
      });
    });
  }
}
