/**
 * Excel export (Owner → Reports) — PURE workbook builders on top of SheetJS
 * (official CDN build, xlsx@0.20.3), so sheet contents are verifiable node-side
 * without a browser. The screen only fetches data and calls XLSX.writeFile.
 *
 * Conventions honoured: money arrives as INTEGER PAISE and is converted to
 * numeric rupees (2dp) ONLY here, at the display/export edge; a row with
 * version > 1 was corrected after first save → "YES" in the Corrected column.
 */
import * as XLSX from 'xlsx';
import type { Attendance, BusinessDate, Expense, Person, Site, User } from '@techbuilder/contracts';
import { ATTENDANCE_STATUS_LABELS, EXPENSE_CATEGORY_LABELS, OWNER_UI } from './messages';

type Cell = string | number;

const ATTENDANCE_HEADER: Cell[] = [
  OWNER_UI.colDate,
  OWNER_UI.colSite,
  OWNER_UI.colPerson,
  OWNER_UI.colStatus,
  OWNER_UI.colOtHours,
  OWNER_UI.colMarkedBy,
  OWNER_UI.colCorrected,
];

const EXPENSE_HEADER: Cell[] = [
  OWNER_UI.colDate,
  OWNER_UI.colSite,
  OWNER_UI.colCategory,
  OWNER_UI.colAmount,
  OWNER_UI.colBillNo,
  OWNER_UI.colEnteredBy,
  OWNER_UI.colVoided,
  OWNER_UI.colCorrected,
];

function nameOf<T extends { id: string; name: string }>(rows: T[], id: string | null): string {
  return (id && rows.find((r) => r.id === id)?.name) || '';
}

const corrected = (version: number): string => (version > 1 ? OWNER_UI.exportYes : '');

/** Attendance sheet rows (header + data), oldest date first. */
export function attendanceSheetRows(atts: Attendance[], sites: Site[], people: Person[], users: User[]): Cell[][] {
  const sorted = [...atts].sort(
    (a, b) =>
      a.businessDate.localeCompare(b.businessDate) ||
      nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)) ||
      nameOf(people, a.personId).localeCompare(nameOf(people, b.personId)),
  );
  return [
    ATTENDANCE_HEADER,
    ...sorted.map((a): Cell[] => [
      a.businessDate,
      nameOf(sites, a.siteId),
      nameOf(people, a.personId),
      ATTENDANCE_STATUS_LABELS[a.status],
      a.otHours,
      nameOf(users, a.markedBy),
      corrected(a.version),
    ]),
  ];
}

/** Expense sheet rows (header + data), oldest date first. Amount = numeric rupees. */
export function expenseSheetRows(expenses: Expense[], sites: Site[], users: User[]): Cell[][] {
  const sorted = [...expenses].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || nameOf(sites, a.siteId).localeCompare(nameOf(sites, b.siteId)),
  );
  return [
    EXPENSE_HEADER,
    ...sorted.map((e): Cell[] => [
      e.businessDate,
      nameOf(sites, e.siteId),
      EXPENSE_CATEGORY_LABELS[e.category],
      Math.round(e.amountPaise) / 100, // integer paise → numeric rupees at the edge
      e.billNo ?? '',
      nameOf(users, e.enteredBy),
      e.void ? OWNER_UI.exportYes : '',
      corrected(e.version),
    ]),
  ];
}

/** Two-sheet workbook: Attendance + Expenses. Amount column formatted 2dp. */
export function buildWorkbook(attRows: Cell[][], expRows: Cell[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const attWs = XLSX.utils.aoa_to_sheet(attRows);
  const expWs = XLSX.utils.aoa_to_sheet(expRows);
  // "Amount ₹" is column D (index 3) — force a 2dp number format on data rows.
  for (let r = 1; r < expRows.length; r++) {
    const cell = expWs[XLSX.utils.encode_cell({ r, c: 3 })] as XLSX.CellObject | undefined;
    if (cell && cell.t === 'n') cell.z = '0.00';
  }
  XLSX.utils.book_append_sheet(wb, attWs, OWNER_UI.sheetAttendance);
  XLSX.utils.book_append_sheet(wb, expWs, OWNER_UI.sheetExpenses);
  return wb;
}

/** e.g. techbuilder-devco-2026-06-27-2026-07-03.xlsx */
export function exportFileName(orgCode: string, from: BusinessDate, to: BusinessDate): string {
  return `techbuilder-${orgCode.toLowerCase()}-${from}-${to}.xlsx`;
}
