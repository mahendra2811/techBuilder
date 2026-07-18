/**
 * Excel export (Owner/SM → Reports) — PURE workbook builders on top of ExcelJS
 * (lazy-imported so it leaves the initial route bundle; only loads when an
 * export is actually built). Each builder returns a `SheetSpec`; the screen
 * only fetches data, calls the builders for whichever sections are checked,
 * and passes the list to `buildWorkbook` + `downloadWorkbook`.
 *
 * Conventions honoured: money arrives as INTEGER PAISE and is converted to
 * numeric rupees (2dp) ONLY here, at the display/export edge; a row with
 * version > 1 was corrected after first save → catalog "yes" in the Corrected
 * column. Headers/labels come from the ACTIVE locale's catalog (passed in).
 */
import type ExcelJS from 'exceljs';
import {
  EXPENSE_CATEGORIES,
  type Attendance,
  type BusinessDate,
  type CashTransfer,
  type Expense,
  type FuelLog,
  type Issue,
  type LedgerRollupRow,
  type MaterialTxn,
  type Person,
  type ProgressNote,
  type Site,
  type Trip,
  type User,
  type Vehicle,
  type VehicleLog,
  type Vendor,
  type VendorLedger,
} from '@techbuilder/contracts';
import type { Messages } from './i18n/messages';

export type Cell = string | number;
export type ColumnKind = 'text' | 'money' | 'number';

export interface ColumnSpec {
  key: string;
  header: string;
  width?: number;
  kind?: ColumnKind;
}

export interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  rows: Record<string, Cell>[];
  /** Optional bold totals row appended at the end (same column keys as `columns`). */
  totals?: Record<string, Cell>;
}

export interface SectionSummary {
  label: string;
  rowCount: number;
  totalPaise?: number;
}

const rupees = (paise: number): number => Math.round(paise) / 100;

function nameOf<T extends { id: string; name: string }>(rows: T[], id: string | null | undefined): string {
  return (id && rows.find((r) => r.id === id)?.name) || '';
}

const corrected = (version: number, m: Messages): string => (version > 1 ? m.OWNER_UI.exportYes : '');

// ---------------------------------------------------------------------------
// Summary (always the first sheet)
// ---------------------------------------------------------------------------

export function buildSummarySheet(
  input: {
    orgName: string;
    from: BusinessDate;
    to: BusinessDate;
    generatedAt: string;
    requestedBy: string;
    sections: SectionSummary[];
  },
  m: Messages,
): SheetSpec {
  const o = m.EXPORT_UI;
  const rows: Record<string, Cell>[] = [
    { field: o.summaryOrg, value: input.orgName },
    { field: o.summaryPeriod, value: `${input.from} → ${input.to}` },
    { field: o.summaryGeneratedAt, value: input.generatedAt },
    { field: o.summaryRequestedBy, value: input.requestedBy },
    { field: '', value: '' },
    ...input.sections.map((s): Record<string, Cell> => ({
      field: s.label,
      value: '',
      rows: s.rowCount,
      ...(s.totalPaise !== undefined ? { amount: rupees(s.totalPaise) } : {}),
    })),
  ];
  return {
    name: o.sheetSummary,
    columns: [
      { key: 'field', header: o.summaryColField, width: 28 },
      { key: 'value', header: o.summaryColValue, width: 28 },
      { key: 'rows', header: o.summaryColRows, width: 12, kind: 'number' },
      { key: 'amount', header: o.summaryColAmount, width: 16, kind: 'money' },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function buildAttendanceSheet(
  atts: Attendance[],
  sites: Site[],
  people: Person[],
  users: User[],
  m: Messages,
): SheetSpec {
  const o = m.OWNER_UI;
  const sorted = [...atts].sort(
    (a, b) =>
      a.businessDate.localeCompare(b.businessDate) ||
      nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)) ||
      nameOf(people, a.personId).localeCompare(nameOf(people, b.personId)),
  );
  return {
    name: o.sheetAttendance,
    columns: [
      { key: 'date', header: o.colDate, width: 12 },
      { key: 'site', header: o.colSite, width: 18 },
      { key: 'person', header: o.colPerson, width: 20 },
      { key: 'status', header: o.colStatus, width: 12 },
      { key: 'otHours', header: o.colOtHours, width: 10, kind: 'number' },
      { key: 'markedBy', header: o.colMarkedBy, width: 18 },
      { key: 'corrected', header: o.colCorrected, width: 10 },
    ],
    rows: sorted.map((a) => ({
      date: a.businessDate,
      site: nameOf(sites, a.siteId),
      person: nameOf(people, a.personId),
      status: m.ATTENDANCE_STATUS_LABELS[a.status],
      otHours: a.otHours,
      markedBy: nameOf(users, a.markedBy),
      corrected: corrected(a.version, m),
    })),
  };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export function buildExpenseSheet(
  expenses: Expense[],
  sites: Site[],
  vendors: Vendor[],
  users: User[],
  m: Messages,
): SheetSpec {
  const o = m.OWNER_UI;
  const sorted = [...expenses].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)),
  );
  const total = sorted.filter((e) => !e.void).reduce((sum, e) => sum + e.amountPaise, 0);
  return {
    name: o.sheetExpenses,
    columns: [
      { key: 'date', header: o.colDate, width: 12 },
      { key: 'site', header: o.colSite, width: 18 },
      { key: 'category', header: o.colCategory, width: 14 },
      { key: 'amount', header: o.colAmount, width: 14, kind: 'money' },
      { key: 'paidVia', header: m.EXPORT_UI.colPaidVia, width: 14 },
      { key: 'shop', header: m.EXPORT_UI.colShop, width: 18 },
      { key: 'billNo', header: o.colBillNo, width: 14 },
      { key: 'remark', header: m.EXPORT_UI.colRemark, width: 24 },
      { key: 'enteredBy', header: o.colEnteredBy, width: 18 },
      { key: 'voided', header: o.colVoided, width: 10 },
      { key: 'corrected', header: o.colCorrected, width: 10 },
    ],
    rows: sorted.map((e) => ({
      date: e.businessDate,
      site: nameOf(sites, e.siteId),
      category: m.EXPENSE_CATEGORY_LABELS[e.category],
      amount: rupees(e.amountPaise),
      paidVia: e.paidVia === 'VENDOR_CREDIT' ? m.VENDOR_UI.paidByCredit : m.VENDOR_UI.paidByCash,
      shop: nameOf(vendors, e.vendorId),
      billNo: e.billNo ?? '',
      remark: e.remark ?? '',
      enteredBy: nameOf(users, e.enteredBy),
      voided: e.void ? m.OWNER_UI.exportYes : '',
      corrected: corrected(e.version, m),
    })),
    totals: { date: m.EXPORT_UI.totalsLabel, amount: rupees(total) },
  };
}

// ---------------------------------------------------------------------------
// Money — cash khata (transfers + rollup)
// ---------------------------------------------------------------------------

export function buildCashTransferSheet(transfers: CashTransfer[], users: User[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...transfers].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const total = sorted.reduce((sum, t) => sum + t.amountPaise, 0);
  return {
    name: o.sheetCashTransfers,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'from', header: o.colFrom, width: 18 },
      { key: 'to', header: o.colTo, width: 18 },
      { key: 'kind', header: o.colKind, width: 12 },
      { key: 'amount', header: m.OWNER_UI.colAmount, width: 14, kind: 'money' },
      { key: 'note', header: o.colNote, width: 24 },
    ],
    rows: sorted.map((t) => ({
      date: t.businessDate,
      from: nameOf(users, t.fromUserId),
      to: nameOf(users, t.toUserId),
      kind: t.kind === 'GIVE' ? m.LEDGER_UI.kindChipGive : m.LEDGER_UI.kindChipReturn,
      amount: rupees(t.amountPaise),
      note: t.note ?? '',
    })),
    totals: { date: o.totalsLabel, amount: rupees(total) },
  };
}

export function buildLedgerRollupSheet(rollup: LedgerRollupRow[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const catCols: ColumnSpec[] = EXPENSE_CATEGORIES.map((c) => ({
    key: `cat_${c}`,
    header: m.EXPENSE_CATEGORY_LABELS[c],
    width: 14,
    kind: 'money',
  }));
  return {
    name: o.sheetBalanceSummary,
    columns: [
      { key: 'name', header: m.OWNER_UI.colPerson, width: 20 },
      { key: 'role', header: o.colRole, width: 14 },
      { key: 'received', header: m.LEDGER_UI.rollupReceived, width: 14, kind: 'money' },
      { key: 'given', header: m.LEDGER_UI.rollupGiven, width: 14, kind: 'money' },
      { key: 'spent', header: m.LEDGER_UI.rollupSpent, width: 14, kind: 'money' },
      { key: 'balance', header: o.colBalance, width: 14, kind: 'money' },
      ...catCols,
    ],
    rows: rollup.map((r) => ({
      name: r.name,
      role: m.ROLE_LABELS[r.role],
      received: rupees(r.receivedPaise),
      given: rupees(r.givenPaise),
      spent: rupees(r.spentPaise),
      balance: rupees(r.balancePaise),
      ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [`cat_${c}`, rupees(r.byCategory[c] ?? 0)])),
    })),
  };
}

// ---------------------------------------------------------------------------
// Vendors / udhaar
// ---------------------------------------------------------------------------

export function buildVendorSheet(
  vendors: Vendor[],
  ledgers: Map<string, VendorLedger>,
  sites: Site[],
  m: Messages,
): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...vendors].sort((a, b) => a.name.localeCompare(b.name));
  return {
    name: o.sheetVendors,
    columns: [
      { key: 'name', header: o.colVendorName, width: 20 },
      { key: 'phone', header: o.colPhone, width: 16 },
      { key: 'sells', header: m.VENDOR_UI.sellsLabel, width: 18 },
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'purchased', header: m.VENDOR_UI.purchasedLabel, width: 16, kind: 'money' },
      { key: 'paid', header: m.VENDOR_UI.paidLabel, width: 16, kind: 'money' },
      { key: 'balance', header: m.VENDOR_UI.balanceLabel, width: 16, kind: 'money' },
    ],
    rows: sorted.map((v) => {
      const l = ledgers.get(v.id);
      return {
        name: v.name,
        phone: v.phone ?? '',
        sells: v.sells ?? '',
        site: nameOf(sites, v.siteId),
        purchased: rupees(l?.purchasedPaise ?? 0),
        paid: rupees(l?.paidPaise ?? 0),
        balance: rupees(l?.balancePaise ?? 0),
      };
    }),
  };
}

export function buildVendorMonthsSheet(vendors: Vendor[], ledgers: Map<string, VendorLedger>, m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const rows: Record<string, Cell>[] = [];
  for (const v of vendors) {
    const l = ledgers.get(v.id);
    for (const mo of l?.months ?? []) {
      rows.push({
        shop: v.name,
        month: mo.month,
        purchased: rupees(mo.purchasedPaise),
        paid: rupees(mo.paidPaise),
      });
    }
  }
  rows.sort((a, b) => (a.shop as string).localeCompare(b.shop as string) || (a.month as string).localeCompare(b.month as string));
  return {
    name: o.sheetVendorMonths,
    columns: [
      { key: 'shop', header: o.colVendorName, width: 20 },
      { key: 'month', header: o.colMonth, width: 12 },
      { key: 'purchased', header: m.VENDOR_UI.purchasedLabel, width: 16, kind: 'money' },
      { key: 'paid', header: m.VENDOR_UI.paidLabel, width: 16, kind: 'money' },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// Progress notes
// ---------------------------------------------------------------------------

export function buildProgressSheet(notes: ProgressNote[], sites: Site[], users: User[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...notes].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)),
  );
  return {
    name: o.sheetProgress,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'text', header: o.colReportText, width: 40 },
      { key: 'photos', header: o.colPhotoCount, width: 10, kind: 'number' },
      { key: 'enteredBy', header: m.OWNER_UI.colEnteredBy, width: 18 },
      { key: 'corrected', header: m.OWNER_UI.colCorrected, width: 10 },
    ],
    rows: sorted.map((n) => ({
      date: n.businessDate,
      site: nameOf(sites, n.siteId),
      text: n.text,
      photos: n.mediaIds.length,
      enteredBy: nameOf(users, n.enteredBy),
      corrected: corrected(n.version, m),
    })),
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * No `/materials` catalog endpoint exists in the backend (checked — only
 * `material-txn` create/list), so `materialId` cannot be resolved to a name
 * from the frontend. Deliberately omits a "Material" column rather than show
 * a raw UUID or add a new backend read for this export.
 */
export function buildMaterialSheet(txns: MaterialTxn[], sites: Site[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...txns].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  return {
    name: o.sheetMaterial,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'type', header: o.colTxnType, width: 14 },
      { key: 'qty', header: o.colQty, width: 10, kind: 'number' },
      { key: 'uom', header: o.colUom, width: 10 },
      { key: 'status', header: m.OWNER_UI.colStatus, width: 12 },
      { key: 'counterpartSite', header: o.colCounterpartSite, width: 18 },
    ],
    rows: sorted.map((t) => ({
      date: t.businessDate,
      site: nameOf(sites, t.siteId),
      type: o.materialTxnTypeLabels[t.type],
      qty: t.qty,
      uom: m.UOM_LABELS[t.uom],
      status: o.materialTxnStatusLabels[t.status],
      counterpartSite: nameOf(sites, t.counterpartSiteId),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fleet — fuel / vehicle day logs / trips
// ---------------------------------------------------------------------------

export function buildFuelSheet(logs: FuelLog[], vehicles: Vehicle[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...logs].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  // frozen.10 (DRV-4): amountPaise is null when the diesel came from site stock/khata
  // (no money paid) — excluded from the sum, rendered as a blank cell (not ₹0).
  const total = sorted.reduce((sum, l) => sum + (l.amountPaise ?? 0), 0);
  return {
    name: o.sheetFuel,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'vehicle', header: o.colVehicle, width: 16 },
      { key: 'litres', header: o.colLitres, width: 10, kind: 'number' },
      { key: 'amount', header: m.OWNER_UI.colAmount, width: 14, kind: 'money' },
      { key: 'reading', header: o.colReading, width: 12, kind: 'number' },
    ],
    rows: sorted.map((l) => ({
      date: l.businessDate,
      vehicle: nameOf(vehicles.map((v) => ({ id: v.id, name: v.regNo })), l.vehicleId),
      litres: l.litres,
      amount: l.amountPaise != null ? rupees(l.amountPaise) : '',
      reading: l.reading,
    })),
    totals: { date: o.totalsLabel, amount: rupees(total) },
  };
}

export function buildVehicleLogSheet(logs: VehicleLog[], vehicles: Vehicle[], people: Person[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...logs].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const regNos = vehicles.map((v) => ({ id: v.id, name: v.regNo }));
  return {
    name: o.sheetVehicleLogs,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'vehicle', header: o.colVehicle, width: 16 },
      { key: 'driver', header: o.colDriver, width: 18 },
      { key: 'start', header: o.colStartReading, width: 12, kind: 'number' },
      { key: 'end', header: o.colEndReading, width: 12, kind: 'number' },
      { key: 'hours', header: o.colHoursWorked, width: 12, kind: 'number' },
      { key: 'loads', header: o.colLoads, width: 10, kind: 'number' },
      { key: 'note', header: o.colNote, width: 24 },
    ],
    rows: sorted.map((l) => ({
      date: l.businessDate,
      vehicle: nameOf(regNos, l.vehicleId),
      driver: nameOf(people, l.driverPersonId),
      start: l.startReading,
      end: l.endReading ?? '',
      hours: l.hoursWorked ?? '',
      loads: l.loadsCount ?? '',
      note: l.note ?? '',
    })),
  };
}

export function buildTripSheet(trips: Trip[], vehicles: Vehicle[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...trips].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const regNos = vehicles.map((v) => ({ id: v.id, name: v.regNo }));
  return {
    name: o.sheetTrips,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'vehicle', header: o.colVehicle, width: 16 },
      { key: 'from', header: o.colTripFrom, width: 20 },
      { key: 'to', header: o.colTripTo, width: 20 },
      { key: 'purpose', header: o.colPurpose, width: 24 },
    ],
    rows: sorted.map((t) => ({
      date: t.businessDate,
      vehicle: nameOf(regNos, t.vehicleId),
      from: t.fromText,
      to: t.toText,
      purpose: t.purpose ?? '',
    })),
  };
}

// ---------------------------------------------------------------------------
// Issues / damage
// ---------------------------------------------------------------------------

export function buildIssueSheet(issues: Issue[], sites: Site[], vehicles: Vehicle[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const sorted = [...issues].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const regNos = vehicles.map((v) => ({ id: v.id, name: v.regNo }));
  return {
    name: o.sheetIssues,
    columns: [
      { key: 'date', header: m.OWNER_UI.colDate, width: 12 },
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'vehicle', header: o.colVehicle, width: 16 },
      { key: 'severity', header: o.colSeverity, width: 12 },
      { key: 'status', header: m.OWNER_UI.colStatus, width: 12 },
      { key: 'description', header: o.colDescription, width: 32 },
      { key: 'corrected', header: m.OWNER_UI.colCorrected, width: 10 },
    ],
    rows: sorted.map((i) => ({
      date: i.businessDate,
      site: nameOf(sites, i.siteId),
      vehicle: nameOf(regNos, i.vehicleId),
      severity: m.VEHICLE_WAVE_UI.SEVERITY_LABELS[i.severity],
      status: m.VEHICLE_WAVE_UI.STATUS_LABELS[i.status],
      description: i.description,
      corrected: corrected(i.version, m),
    })),
  };
}

// ---------------------------------------------------------------------------
// Site-wise summary (aggregated from other already-fetched sections)
// ---------------------------------------------------------------------------

export function buildSiteSummarySheet(
  input: {
    sites: Site[];
    attendance: Attendance[];
    expenses: Expense[];
    fuel: FuelLog[];
    vehicles: Vehicle[];
    progress: ProgressNote[];
    issues: Issue[];
  },
  m: Messages,
): SheetSpec {
  const o = m.EXPORT_UI;
  const { sites, attendance, expenses, fuel, vehicles, progress, issues } = input;
  const rows = sites.map((s) => {
    const fuelPaise = fuel
      .filter((f) => vehicles.find((v) => v.id === f.vehicleId)?.assignedSiteId === s.id)
      .reduce((sum, f) => sum + (f.amountPaise ?? 0), 0);
    return {
      site: s.name,
      marked: attendance.filter((a) => a.siteId === s.id).length,
      expense: rupees(expenses.filter((e) => e.siteId === s.id && !e.void).reduce((sum, e) => sum + e.amountPaise, 0)),
      fuel: rupees(fuelPaise),
      progressCount: progress.filter((p) => p.siteId === s.id).length,
      openIssues: issues.filter((i) => i.siteId === s.id && i.status === 'OPEN').length,
    };
  });
  return {
    name: o.sheetSiteSummary,
    columns: [
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'marked', header: o.colHeadcount, width: 12, kind: 'number' },
      { key: 'expense', header: m.OWNER_UI.colAmount, width: 14, kind: 'money' },
      { key: 'fuel', header: o.colFuelAmount, width: 14, kind: 'money' },
      { key: 'progressCount', header: o.colProgressNotes, width: 14, kind: 'number' },
      { key: 'openIssues', header: o.colOpenIssues, width: 12, kind: 'number' },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// People directory (window-independent reference list)
// ---------------------------------------------------------------------------

export function buildPeopleSheet(people: Person[], users: User[], sites: Site[], m: Messages): SheetSpec {
  const o = m.EXPORT_UI;
  const byPersonId = new Map(users.filter((u) => u.personId).map((u) => [u.personId as string, u]));
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  return {
    name: o.sheetPeople,
    columns: [
      { key: 'name', header: o.colName, width: 20 },
      { key: 'role', header: o.colRole, width: 14 },
      { key: 'phone', header: o.colPhone, width: 16 },
      { key: 'site', header: m.OWNER_UI.colSite, width: 18 },
      { key: 'skill', header: o.colSkill, width: 14 },
      { key: 'active', header: o.colActive, width: 10 },
    ],
    rows: sorted.map((p) => {
      const u = byPersonId.get(p.id);
      return {
        name: p.name,
        role: u ? m.ROLE_LABELS[u.role] : '',
        phone: p.phone ?? u?.phone ?? '',
        site: u ? nameOf(sites, u.assignedSiteId) : '',
        skill: p.skill ? m.PERSON_SKILL_LABELS[p.skill] : '',
        active: p.active ? m.OWNER_UI.exportYes : '',
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Workbook assembly + browser download
// ---------------------------------------------------------------------------

/** Builds the styled workbook (bold+frozen header row, autofilter, column widths, ₹ number formats). */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<ExcelJS.Workbook> {
  const { default: ExcelJS } = await import('exceljs');
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
    if (spec.totals) {
      ws.addRow(spec.totals).font = { bold: true };
    }
  }
  return wb;
}

/** Triggers a browser download of the built workbook. */
export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** e.g. techbuilder-devco-2026-06-27-2026-07-03.xlsx */
export function exportFileName(orgCode: string, from: BusinessDate, to: BusinessDate): string {
  return `techbuilder-${orgCode.toLowerCase()}-${from}-${to}.xlsx`;
}
