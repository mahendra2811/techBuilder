/**
 * Server-side Excel builder for the emailed export (POST /exports/email).
 * Deliberately a slim, independent duplication of `web/src/lib/export-excel.ts`
 * — both consume the same frozen `@techbuilder/contracts` domain types, so
 * drift between the two is bounded, and the backend workspace has no access
 * to the web app's full i18n catalog (a cross-workspace import would break
 * the shared/backend/web boundary). Same formatting spec as the web export:
 * bold+frozen header row, autofilter, ₹ number format, totals row.
 */
import ExcelJS from 'exceljs';
import type {
  Attendance,
  CashTransfer,
  Expense,
  FuelLog,
  Issue,
  LedgerRollupRow,
  Locale,
  MaterialTxn,
  Person,
  ProgressNote,
  Role,
  Site,
  Trip,
  User,
  Vehicle,
  VehicleLog,
  Vendor,
  VendorLedger,
} from '@techbuilder/contracts';
import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';

export type ExportSectionKey =
  | 'expense'
  | 'money'
  | 'vendor'
  | 'attendance'
  | 'progress'
  | 'siteSummary'
  | 'material'
  | 'fleet'
  | 'issue'
  | 'people';

export interface ExportData {
  sites: Site[];
  users: User[];
  people: Person[];
  vehicles: Vehicle[];
  expenses: Expense[];
  progress: ProgressNote[];
  materials: MaterialTxn[];
  fuel: FuelLog[];
  vehicleLogs: VehicleLog[];
  trips: Trip[];
  issues: Issue[];
  attendance: Attendance[];
  cashTransfers: CashTransfer[];
  ledgerRollup: LedgerRollupRow[];
  vendors: Vendor[];
  vendorLedgers: Map<string, VendorLedger>;
}

type Cell = string | number;
type ColumnKind = 'text' | 'money' | 'number';
interface ColumnSpec {
  key: string;
  header: string;
  width?: number;
  kind?: ColumnKind;
}
interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
}

const rupees = (paise: number): number => Math.round(paise) / 100;
function nameOf<T extends { id: string; name: string }>(rows: T[], id: string | null | undefined): string {
  return (id && rows.find((r) => r.id === id)?.name) || '';
}

// Literal-key unions (not Record<string, string>) so property access resolves to `string`,
// not `string | undefined`, under noUncheckedIndexedAccess.
type HeaderKey =
  | 'date' | 'site' | 'person' | 'status' | 'otHours' | 'markedBy' | 'corrected' | 'category' | 'amount'
  | 'paidVia' | 'shop' | 'billNo' | 'remark' | 'enteredBy' | 'voided' | 'from' | 'to' | 'kind' | 'note'
  | 'role' | 'balance' | 'received' | 'given' | 'spent' | 'vendorName' | 'phone' | 'sells' | 'purchased'
  | 'paid' | 'month' | 'reportText' | 'photos' | 'txnType' | 'qty' | 'uom' | 'counterpartSite' | 'vehicle'
  | 'litres' | 'reading' | 'driver' | 'startReading' | 'endReading' | 'hoursWorked' | 'loads' | 'tripFrom'
  | 'tripTo' | 'purpose' | 'severity' | 'description' | 'marked' | 'fuelAmount' | 'progressNotes'
  | 'openIssues' | 'name' | 'skill' | 'active';
type SheetKey =
  | 'attendance' | 'expenses' | 'cashTransfers' | 'balanceSummary' | 'vendors' | 'vendorMonths' | 'progress'
  | 'material' | 'fuel' | 'vehicleLogs' | 'trips' | 'issues' | 'siteSummary' | 'people' | 'summary';

/** Minimal bilingual label set — only what the emailed sheets need (not the full app catalog). */
interface Labels {
  headers: Record<HeaderKey, string>;
  sheets: Record<SheetKey, string>;
  roles: Record<Role, string>;
  attendanceStatus: Record<Attendance['status'], string>;
  expenseCategory: Record<Expense['category'], string>;
  paidVia: Record<Expense['paidVia'], string>;
  cashKind: Record<CashTransfer['kind'], string>;
  issueSeverity: Record<Issue['severity'], string>;
  issueStatus: Record<Issue['status'], string>;
  materialType: Record<MaterialTxn['type'], string>;
  materialStatus: Record<MaterialTxn['status'], string>;
  uom: Record<MaterialTxn['uom'], string>;
  yes: string;
  totalsLabel: string;
}

const EN: Labels = {
  headers: {
    date: 'Date', site: 'Site', person: 'Person', status: 'Status', otHours: 'OT hours', markedBy: 'Marked by',
    corrected: 'Corrected', category: 'Category', amount: 'Amount ₹', paidVia: 'Paid via', shop: 'Shop', billNo: 'Bill no',
    remark: 'Remark', enteredBy: 'Entered by', voided: 'Voided', from: 'From', to: 'To', kind: 'Type', note: 'Note',
    role: 'Role', balance: 'Balance ₹', received: 'Received ₹', given: 'Given ₹', spent: 'Spent ₹', vendorName: 'Vendor',
    phone: 'Phone', sells: 'Sells', purchased: 'Purchased ₹', paid: 'Paid ₹', month: 'Month', reportText: 'Report',
    photos: 'Photos', txnType: 'Transaction type', qty: 'Qty', uom: 'Unit', counterpartSite: 'Counterpart site',
    vehicle: 'Vehicle', litres: 'Litres', reading: 'Reading', driver: 'Driver', startReading: 'Start reading',
    endReading: 'End reading', hoursWorked: 'Hours worked', loads: 'Loads', tripFrom: 'From', tripTo: 'To',
    purpose: 'Purpose', severity: 'Severity', description: 'Description', marked: 'Marked', fuelAmount: 'Fuel ₹',
    progressNotes: 'Progress notes', openIssues: 'Open issues', name: 'Name', skill: 'Skill', active: 'Active',
  },
  sheets: {
    attendance: 'Attendance', expenses: 'Expenses', cashTransfers: 'Cash Transfers', balanceSummary: 'Balance Summary',
    vendors: 'Vendors', vendorMonths: 'Vendor Months', progress: 'Progress', material: 'Materials', fuel: 'Fuel',
    vehicleLogs: 'Vehicle Logs', trips: 'Trips', issues: 'Issues', siteSummary: 'Site Summary', people: 'People',
    summary: 'Summary',
  },
  roles: { OWNER: 'Owner', SITE_MANAGER: 'Site Manager', SUPERVISOR: 'Supervisor', DRIVER: 'Driver', WORKER: 'Worker', ACCOUNTANT: 'Accountant' },
  attendanceStatus: { PRESENT: 'Present', ABSENT: 'Absent', HALF_DAY: 'Half day' },
  expenseCategory: { FOOD: 'Food', SUPPLIES: 'Supplies', TRANSPORT: 'Transport', LABOUR: 'Labour', REPAIR: 'Repair', MISC: 'Misc' },
  paidVia: { CASH: 'Cash', VENDOR_CREDIT: 'On credit at shop' },
  cashKind: { GIVE: 'Gave', RETURN: 'Returned' },
  issueSeverity: { LOW: 'Small', MEDIUM: 'Medium', HIGH: 'Big' },
  issueStatus: { OPEN: 'Open', RESOLVED: 'Resolved' },
  materialType: { IN: 'Received (in)', CONSUME: 'Consumed', DISPATCH: 'Dispatched', RECEIVE: 'Received (transfer)' },
  materialStatus: { PENDING: 'Pending', CONFIRMED: 'Confirmed', MISMATCH: 'Mismatch' },
  uom: { BAG: 'Bag', KG: 'Kg', CFT: 'CFT', NOS: 'Nos', MT: 'Tonne', LITRE: 'Litre' },
  yes: 'YES',
  totalsLabel: 'Total',
};

const HI: Labels = {
  headers: {
    date: 'तारीख', site: 'साइट', person: 'नाम', status: 'हाज़िरी', otHours: 'OT घंटे', markedBy: 'किसने लगाई',
    corrected: 'सुधारा गया', category: 'किस चीज़ पर', amount: 'रकम ₹', paidVia: 'कैसे पेमेंट', shop: 'दुकान', billNo: 'बिल नं',
    remark: 'नोट', enteredBy: 'किसने भरा', voided: 'रद्द', from: 'किससे', to: 'किसको', kind: 'टाइप', note: 'नोट',
    role: 'भूमिका', balance: 'बैलेंस ₹', received: 'मिला ₹', given: 'दिया ₹', spent: 'खर्च ₹', vendorName: 'दुकान',
    phone: 'फ़ोन', sells: 'क्या बेचते हैं', purchased: 'खरीदा ₹', paid: 'दिया ₹', month: 'महीना', reportText: 'रिपोर्ट',
    photos: 'फ़ोटो', txnType: 'किस तरह की एंट्री', qty: 'मात्रा', uom: 'यूनिट', counterpartSite: 'दूसरी साइट',
    vehicle: 'गाड़ी', litres: 'लीटर', reading: 'रीडिंग', driver: 'ड्राइवर', startReading: 'शुरू रीडिंग',
    endReading: 'आख़िर रीडिंग', hoursWorked: 'घंटे', loads: 'लोड', tripFrom: 'कहाँ से', tripTo: 'कहाँ तक',
    purpose: 'काम', severity: 'कितना बड़ा', description: 'क्या हुआ', marked: 'हाज़िरी', fuelAmount: 'फ्यूल ₹',
    progressNotes: 'प्रोग्रेस रिपोर्ट', openIssues: 'खुले इशू', name: 'नाम', skill: 'स्किल', active: 'एक्टिव',
  },
  sheets: {
    attendance: 'हाज़िरी', expenses: 'खर्च', cashTransfers: 'कैश एंट्री', balanceSummary: 'बैलेंस समरी',
    vendors: 'दुकानें', vendorMonths: 'दुकान महीना-वाइज़', progress: 'प्रोग्रेस', material: 'मैटेरियल', fuel: 'फ्यूल',
    vehicleLogs: 'व्हीकल लॉग', trips: 'ट्रिप', issues: 'इशू', siteSummary: 'साइट समरी', people: 'लोग',
    summary: 'समरी',
  },
  roles: { OWNER: 'मालिक', SITE_MANAGER: 'साइट मैनेजर', SUPERVISOR: 'सुपरवाइज़र', DRIVER: 'ड्राइवर', WORKER: 'मज़दूर', ACCOUNTANT: 'अकाउंटेंट' },
  attendanceStatus: { PRESENT: 'उपस्थित', ABSENT: 'अनुपस्थित', HALF_DAY: 'आधा दिन' },
  expenseCategory: { FOOD: 'खाना', SUPPLIES: 'सामान', TRANSPORT: 'आना-जाना', LABOUR: 'मज़दूरी', REPAIR: 'मरम्मत', MISC: 'अन्य' },
  paidVia: { CASH: 'कैश', VENDOR_CREDIT: 'दुकान उधार' },
  cashKind: { GIVE: 'दिया', RETURN: 'वापस मिला' },
  issueSeverity: { LOW: 'छोटा', MEDIUM: 'मध्यम', HIGH: 'बड़ा' },
  issueStatus: { OPEN: 'खुला', RESOLVED: 'सुलझा' },
  materialType: { IN: 'आया (इन)', CONSUME: 'इस्तेमाल हुआ', DISPATCH: 'भेजा', RECEIVE: 'मिला (ट्रांसफर)' },
  materialStatus: { PENDING: 'पेंडिंग', CONFIRMED: 'कन्फर्म', MISMATCH: 'मिसमैच' },
  uom: { BAG: 'बोरी', KG: 'किलो', CFT: 'CFT', NOS: 'नग', MT: 'टन', LITRE: 'लीटर' },
  yes: 'हाँ',
  totalsLabel: 'कुल',
};

function labelsFor(locale: Locale): Labels {
  return locale === 'hi' ? HI : EN;
}

const corrected = (version: number, L: Labels): string => (version > 1 ? L.yes : '');

function sheetFor(key: ExportSectionKey, data: ExportData, L: Labels): SheetSpec[] {
  const h = L.headers;
  switch (key) {
    case 'expense': {
      const sorted = [...data.expenses].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      const total = sorted.filter((e) => !e.void).reduce((sum, e) => sum + e.amountPaise, 0);
      return [
        {
          name: L.sheets.expenses,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'category', header: h.category, width: 14 },
            { key: 'amount', header: h.amount, width: 14, kind: 'money' },
            { key: 'paidVia', header: h.paidVia, width: 14 },
            { key: 'shop', header: h.shop, width: 18 },
            { key: 'billNo', header: h.billNo, width: 14 },
            { key: 'remark', header: h.remark, width: 24 },
            { key: 'enteredBy', header: h.enteredBy, width: 18 },
            { key: 'voided', header: h.voided, width: 10 },
            { key: 'corrected', header: h.corrected, width: 10 },
          ],
          rows: sorted.map((e) => ({
            date: e.businessDate,
            site: nameOf(data.sites, e.siteId),
            category: L.expenseCategory[e.category],
            amount: rupees(e.amountPaise),
            paidVia: L.paidVia[e.paidVia],
            shop: nameOf(data.vendors, e.vendorId),
            billNo: e.billNo ?? '',
            remark: e.remark ?? '',
            enteredBy: nameOf(data.users, e.enteredBy),
            voided: e.void ? L.yes : '',
            corrected: corrected(e.version, L),
          })),
          totals: { date: L.totalsLabel, amount: rupees(total) },
        },
      ];
    }
    case 'money': {
      const transfers = [...data.cashTransfers].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      const total = transfers.reduce((sum, t) => sum + t.amountPaise, 0);
      const catCols: ColumnSpec[] = EXPENSE_CATEGORIES.map((c) => ({ key: `cat_${c}`, header: L.expenseCategory[c], width: 14, kind: 'money' as const }));
      return [
        {
          name: L.sheets.cashTransfers,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'from', header: h.from, width: 18 },
            { key: 'to', header: h.to, width: 18 },
            { key: 'kind', header: h.kind, width: 12 },
            { key: 'amount', header: h.amount, width: 14, kind: 'money' },
            { key: 'note', header: h.note, width: 24 },
          ],
          rows: transfers.map((t) => ({
            date: t.businessDate,
            from: nameOf(data.users, t.fromUserId),
            to: nameOf(data.users, t.toUserId),
            kind: L.cashKind[t.kind],
            amount: rupees(t.amountPaise),
            note: t.note ?? '',
          })),
          totals: { date: L.totalsLabel, amount: rupees(total) },
        },
        {
          name: L.sheets.balanceSummary,
          columns: [
            { key: 'name', header: h.person, width: 20 },
            { key: 'role', header: h.role, width: 14 },
            { key: 'received', header: h.received, width: 14, kind: 'money' },
            { key: 'given', header: h.given, width: 14, kind: 'money' },
            { key: 'spent', header: h.spent, width: 14, kind: 'money' },
            { key: 'balance', header: h.balance, width: 14, kind: 'money' },
            ...catCols,
          ],
          rows: data.ledgerRollup.map((r) => ({
            name: r.name,
            role: L.roles[r.role],
            received: rupees(r.receivedPaise),
            given: rupees(r.givenPaise),
            spent: rupees(r.spentPaise),
            balance: rupees(r.balancePaise),
            ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [`cat_${c}`, rupees(r.byCategory[c] ?? 0)])),
          })),
        },
      ];
    }
    case 'vendor': {
      const sorted = [...data.vendors].sort((a, b) => a.name.localeCompare(b.name));
      const monthRows: Record<string, Cell>[] = [];
      for (const v of sorted) {
        const l = data.vendorLedgers.get(v.id);
        for (const mo of l?.months ?? []) {
          monthRows.push({ shop: v.name, month: mo.month, purchased: rupees(mo.purchasedPaise), paid: rupees(mo.paidPaise) });
        }
      }
      return [
        {
          name: L.sheets.vendors,
          columns: [
            { key: 'name', header: h.vendorName, width: 20 },
            { key: 'phone', header: h.phone, width: 16 },
            { key: 'sells', header: h.sells, width: 18 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'purchased', header: h.purchased, width: 16, kind: 'money' },
            { key: 'paid', header: h.paid, width: 16, kind: 'money' },
            { key: 'balance', header: h.balance, width: 16, kind: 'money' },
          ],
          rows: sorted.map((v) => {
            const l = data.vendorLedgers.get(v.id);
            return {
              name: v.name,
              phone: v.phone ?? '',
              sells: v.sells ?? '',
              site: nameOf(data.sites, v.siteId),
              purchased: rupees(l?.purchasedPaise ?? 0),
              paid: rupees(l?.paidPaise ?? 0),
              balance: rupees(l?.balancePaise ?? 0),
            };
          }),
        },
        {
          name: L.sheets.vendorMonths,
          columns: [
            { key: 'shop', header: h.vendorName, width: 20 },
            { key: 'month', header: h.month, width: 12 },
            { key: 'purchased', header: h.purchased, width: 16, kind: 'money' },
            { key: 'paid', header: h.paid, width: 16, kind: 'money' },
          ],
          rows: monthRows,
        },
      ];
    }
    case 'attendance': {
      const sorted = [...data.attendance].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      return [
        {
          name: L.sheets.attendance,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'person', header: h.person, width: 20 },
            { key: 'status', header: h.status, width: 12 },
            { key: 'otHours', header: h.otHours, width: 10, kind: 'number' },
            { key: 'markedBy', header: h.markedBy, width: 18 },
            { key: 'corrected', header: h.corrected, width: 10 },
          ],
          rows: sorted.map((a) => ({
            date: a.businessDate,
            site: nameOf(data.sites, a.siteId),
            person: nameOf(data.people, a.personId),
            status: L.attendanceStatus[a.status],
            otHours: a.otHours,
            markedBy: nameOf(data.users, a.markedBy),
            corrected: corrected(a.version, L),
          })),
        },
      ];
    }
    case 'progress': {
      const sorted = [...data.progress].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      return [
        {
          name: L.sheets.progress,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'text', header: h.reportText, width: 40 },
            { key: 'photos', header: h.photos, width: 10, kind: 'number' },
            { key: 'enteredBy', header: h.enteredBy, width: 18 },
            { key: 'corrected', header: h.corrected, width: 10 },
          ],
          rows: sorted.map((n) => ({
            date: n.businessDate,
            site: nameOf(data.sites, n.siteId),
            text: n.text,
            photos: n.mediaIds.length,
            enteredBy: nameOf(data.users, n.enteredBy),
            corrected: corrected(n.version, L),
          })),
        },
      ];
    }
    case 'siteSummary': {
      const rows = data.sites.map((s) => {
        const fuelPaise = data.fuel
          .filter((f) => data.vehicles.find((v) => v.id === f.vehicleId)?.assignedSiteId === s.id)
          .reduce((sum, f) => sum + (f.amountPaise ?? 0), 0);
        return {
          site: s.name,
          marked: data.attendance.filter((a) => a.siteId === s.id).length,
          expense: rupees(data.expenses.filter((e) => e.siteId === s.id && !e.void).reduce((sum, e) => sum + e.amountPaise, 0)),
          fuel: rupees(fuelPaise),
          progressCount: data.progress.filter((p) => p.siteId === s.id).length,
          openIssues: data.issues.filter((i) => i.siteId === s.id && i.status === 'OPEN').length,
        };
      });
      return [
        {
          name: L.sheets.siteSummary,
          columns: [
            { key: 'site', header: h.site, width: 18 },
            { key: 'marked', header: h.marked, width: 12, kind: 'number' },
            { key: 'expense', header: h.amount, width: 14, kind: 'money' },
            { key: 'fuel', header: h.fuelAmount, width: 14, kind: 'money' },
            { key: 'progressCount', header: h.progressNotes, width: 14, kind: 'number' },
            { key: 'openIssues', header: h.openIssues, width: 12, kind: 'number' },
          ],
          rows,
        },
      ];
    }
    case 'material': {
      const sorted = [...data.materials].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      return [
        {
          name: L.sheets.material,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'type', header: h.txnType, width: 14 },
            { key: 'qty', header: h.qty, width: 10, kind: 'number' },
            { key: 'uom', header: h.uom, width: 10 },
            { key: 'status', header: h.status, width: 12 },
            { key: 'counterpartSite', header: h.counterpartSite, width: 18 },
          ],
          rows: sorted.map((t) => ({
            date: t.businessDate,
            site: nameOf(data.sites, t.siteId),
            type: L.materialType[t.type],
            qty: t.qty,
            uom: L.uom[t.uom],
            status: L.materialStatus[t.status],
            counterpartSite: nameOf(data.sites, t.counterpartSiteId),
          })),
        },
      ];
    }
    case 'fleet': {
      const regNos = data.vehicles.map((v) => ({ id: v.id, name: v.regNo }));
      const fuel = [...data.fuel].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      const totalFuel = fuel.reduce((sum, f) => sum + (f.amountPaise ?? 0), 0);
      const vlogs = [...data.vehicleLogs].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      const trips = [...data.trips].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      return [
        {
          name: L.sheets.fuel,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'vehicle', header: h.vehicle, width: 16 },
            { key: 'litres', header: h.litres, width: 10, kind: 'number' },
            { key: 'amount', header: h.amount, width: 14, kind: 'money' },
            { key: 'reading', header: h.reading, width: 12, kind: 'number' },
          ],
          rows: fuel.map((l) => ({
            date: l.businessDate,
            vehicle: nameOf(regNos, l.vehicleId),
            litres: l.litres,
            // frozen.10: no amount = diesel from site stock/khata — blank cell, not ₹0
            amount: l.amountPaise != null ? rupees(l.amountPaise) : '',
            reading: l.reading,
          })),
          totals: { date: L.totalsLabel, amount: rupees(totalFuel) },
        },
        {
          name: L.sheets.vehicleLogs,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'vehicle', header: h.vehicle, width: 16 },
            { key: 'driver', header: h.driver, width: 18 },
            { key: 'start', header: h.startReading, width: 12, kind: 'number' },
            { key: 'end', header: h.endReading, width: 12, kind: 'number' },
            { key: 'hours', header: h.hoursWorked, width: 12, kind: 'number' },
            { key: 'loads', header: h.loads, width: 10, kind: 'number' },
            { key: 'note', header: h.note, width: 24 },
          ],
          rows: vlogs.map((l) => ({
            date: l.businessDate,
            vehicle: nameOf(regNos, l.vehicleId),
            driver: nameOf(data.people, l.driverPersonId),
            start: l.startReading,
            end: l.endReading ?? '',
            hours: l.hoursWorked ?? '',
            loads: l.loadsCount ?? '',
            note: l.note ?? '',
          })),
        },
        {
          name: L.sheets.trips,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'vehicle', header: h.vehicle, width: 16 },
            { key: 'from', header: h.tripFrom, width: 20 },
            { key: 'to', header: h.tripTo, width: 20 },
            { key: 'purpose', header: h.purpose, width: 24 },
          ],
          rows: trips.map((t) => ({
            date: t.businessDate,
            vehicle: nameOf(regNos, t.vehicleId),
            from: t.fromText,
            to: t.toText,
            purpose: t.purpose ?? '',
          })),
        },
      ];
    }
    case 'issue': {
      const regNos = data.vehicles.map((v) => ({ id: v.id, name: v.regNo }));
      const sorted = [...data.issues].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      return [
        {
          name: L.sheets.issues,
          columns: [
            { key: 'date', header: h.date, width: 12 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'vehicle', header: h.vehicle, width: 16 },
            { key: 'severity', header: h.severity, width: 12 },
            { key: 'status', header: h.status, width: 12 },
            { key: 'description', header: h.description, width: 32 },
            { key: 'corrected', header: h.corrected, width: 10 },
          ],
          rows: sorted.map((i) => ({
            date: i.businessDate,
            site: nameOf(data.sites, i.siteId),
            vehicle: nameOf(regNos, i.vehicleId),
            severity: L.issueSeverity[i.severity],
            status: L.issueStatus[i.status],
            description: i.description,
            corrected: corrected(i.version, L),
          })),
        },
      ];
    }
    case 'people': {
      const byPersonId = new Map(data.users.filter((u) => u.personId).map((u) => [u.personId as string, u]));
      const sorted = [...data.people].sort((a, b) => a.name.localeCompare(b.name));
      return [
        {
          name: L.sheets.people,
          columns: [
            { key: 'name', header: h.name, width: 20 },
            { key: 'role', header: h.role, width: 14 },
            { key: 'phone', header: h.phone, width: 16 },
            { key: 'site', header: h.site, width: 18 },
            { key: 'skill', header: h.skill, width: 14 },
            { key: 'active', header: h.active, width: 10 },
          ],
          rows: sorted.map((p) => {
            const u = byPersonId.get(p.id);
            return {
              name: p.name,
              role: u ? L.roles[u.role] : '',
              phone: p.phone ?? u?.phone ?? '',
              site: u ? nameOf(data.sites, u.assignedSiteId) : '',
              skill: p.skill ?? '',
              active: p.active ? L.yes : '',
            };
          }),
        },
      ];
    }
  }
}

/** Builds the full styled workbook for the requested sections. */
export async function buildExportWorkbook(sections: ExportSectionKey[], data: ExportData, locale: Locale): Promise<ExcelJS.Workbook> {
  const L = labelsFor(locale);
  const sheets = sections.flatMap((s) => sheetFor(s, data, L));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'techBuilder';
  wb.created = new Date();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));
    ws.getRow(1).font = { bold: true };
    spec.rows.forEach((r) => ws.addRow(r));
    for (const c of spec.columns) {
      if (c.kind === 'money') ws.getColumn(c.key).numFmt = '#,##0.00';
    }
    if (spec.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
    }
    if (spec.totals) ws.addRow(spec.totals).font = { bold: true };
  }
  return wb;
}
