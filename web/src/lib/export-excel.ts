/**
 * Excel export (Owner → Reports) — PURE workbook builders on top of SheetJS
 * (official CDN build, xlsx@0.20.3), so sheet contents are verifiable node-side
 * without a browser. The screen only fetches data and calls XLSX.writeFile.
 *
 * Conventions honoured: money arrives as INTEGER PAISE and is converted to
 * numeric rupees (2dp) ONLY here, at the display/export edge; a row with
 * version > 1 was corrected after first save → catalog "yes" in the Corrected
 * column. Headers/labels come from the ACTIVE locale's catalog (passed in).
 */
import type * as XLSX from 'xlsx';
import type { Attendance, BusinessDate, Expense, Person, Site, User } from '@techbuilder/contracts';
import type { Messages } from './i18n/messages';

type Cell = string | number;

function attendanceHeader(m: Messages): Cell[] {
  const o = m.OWNER_UI;
  return [o.colDate, o.colSite, o.colPerson, o.colStatus, o.colOtHours, o.colMarkedBy, o.colCorrected];
}

function expenseHeader(m: Messages): Cell[] {
  const o = m.OWNER_UI;
  return [o.colDate, o.colSite, o.colCategory, o.colAmount, o.colBillNo, o.colEnteredBy, o.colVoided, o.colCorrected];
}

function nameOf<T extends { id: string; name: string }>(rows: T[], id: string | null): string {
  return (id && rows.find((r) => r.id === id)?.name) || '';
}

const corrected = (version: number, m: Messages): string => (version > 1 ? m.OWNER_UI.exportYes : '');

/** Attendance sheet rows (header + data), oldest date first. */
export function attendanceSheetRows(
  atts: Attendance[],
  sites: Site[],
  people: Person[],
  users: User[],
  m: Messages,
): Cell[][] {
  const sorted = [...atts].sort(
    (a, b) =>
      a.businessDate.localeCompare(b.businessDate) ||
      nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)) ||
      nameOf(people, a.personId).localeCompare(nameOf(people, b.personId)),
  );
  return [
    attendanceHeader(m),
    ...sorted.map((a): Cell[] => [
      a.businessDate,
      nameOf(sites, a.siteId),
      nameOf(people, a.personId),
      m.ATTENDANCE_STATUS_LABELS[a.status],
      a.otHours,
      nameOf(users, a.markedBy),
      corrected(a.version, m),
    ]),
  ];
}

/** Expense sheet rows (header + data), oldest date first. Amount = numeric rupees. */
export function expenseSheetRows(expenses: Expense[], sites: Site[], users: User[], m: Messages): Cell[][] {
  const sorted = [...expenses].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)),
  );
  return [
    expenseHeader(m),
    ...sorted.map((e): Cell[] => [
      e.businessDate,
      nameOf(sites, e.siteId),
      m.EXPENSE_CATEGORY_LABELS[e.category],
      Math.round(e.amountPaise) / 100, // integer paise → numeric rupees at the edge
      e.billNo ?? '',
      nameOf(users, e.enteredBy),
      e.void ? m.OWNER_UI.exportYes : '',
      corrected(e.version, m),
    ]),
  ];
}

/** Two-sheet workbook: Attendance + Expenses. Amount column formatted 2dp.
 * SheetJS is lazy-imported here (not at module top) so it leaves the initial
 * route bundle and only loads when an export is actually triggered. */
export async function buildWorkbook(attRows: Cell[][], expRows: Cell[][], m: Messages): Promise<XLSX.WorkBook> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const attWs = XLSX.utils.aoa_to_sheet(attRows);
  const expWs = XLSX.utils.aoa_to_sheet(expRows);
  // "Amount ₹" is column D (index 3) — force a 2dp number format on data rows.
  for (let r = 1; r < expRows.length; r++) {
    const cell = expWs[XLSX.utils.encode_cell({ r, c: 3 })] as XLSX.CellObject | undefined;
    if (cell && cell.t === 'n') cell.z = '0.00';
  }
  XLSX.utils.book_append_sheet(wb, attWs, m.OWNER_UI.sheetAttendance);
  XLSX.utils.book_append_sheet(wb, expWs, m.OWNER_UI.sheetExpenses);
  return wb;
}

/** e.g. techbuilder-devco-2026-06-27-2026-07-03.xlsx */
export function exportFileName(orgCode: string, from: BusinessDate, to: BusinessDate): string {
  return `techbuilder-${orgCode.toLowerCase()}-${from}-${to}.xlsx`;
}
