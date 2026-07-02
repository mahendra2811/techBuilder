/**
 * Pure wage/cost math (WP-5: unit-tested — this is the number the Owner trusts or doesn't).
 * net = round(rate × (present + 0.5·half)) + round(ot_hours × (rate/8) × otMultiplier) − advances.
 * Integer paise everywhere; rounding only at the two payable boundaries.
 */
import type { WageSummaryRow } from '@techbuilder/contracts';

export interface WageAttendanceRow {
  personId: string;
  siteId: string;
  crewId: string | null;
  status: string; // AttendanceStatus
  otHours: number | null;
}
export interface WagePersonRow {
  id: string;
  name: string;
  defaultWagePaise: number | null;
}
export interface WageRateRow {
  personId: string;
  dailyPaise: number;
  effectiveFrom: string;
}
export interface WageAdvanceRow {
  personId: string | null;
  amountPaise: number;
}

export interface WageTotals {
  grossPaise: number;
  advancePaise: number;
  netPaise: number;
}

export function computeWageRows(
  attendance: WageAttendanceRow[],
  people: WagePersonRow[],
  rates: WageRateRow[],
  advances: WageAdvanceRow[],
  otMultiplier: number,
): { rows: WageSummaryRow[]; totals: WageTotals } {
  const nameOf = new Map(people.map((x) => [x.id, x.name]));
  const defaultRateOf = new Map(people.map((x) => [x.id, x.defaultWagePaise]));

  // latest effective rate per person (caller pre-filters effectiveFrom <= window.to)
  const rateOf = new Map<string, number>();
  const rateAsOf = new Map<string, string>();
  for (const r of rates) {
    const prev = rateAsOf.get(r.personId);
    if (!prev || r.effectiveFrom > prev) {
      rateAsOf.set(r.personId, r.effectiveFrom);
      rateOf.set(r.personId, r.dailyPaise);
    }
  }

  const advanceOf = new Map<string, number>();
  for (const a of advances) {
    if (!a.personId) continue; // crew-level advances are not allocated per-person in this summary
    advanceOf.set(a.personId, (advanceOf.get(a.personId) ?? 0) + a.amountPaise);
  }

  type Agg = { present: number; half: number; ot: number; siteId: string; crewId: string | null };
  const agg = new Map<string, Agg>();
  for (const a of attendance) {
    const cur = agg.get(a.personId) ?? { present: 0, half: 0, ot: 0, siteId: a.siteId, crewId: a.crewId };
    if (a.status === 'PRESENT') cur.present += 1;
    else if (a.status === 'HALF_DAY') cur.half += 1;
    cur.ot += a.otHours ?? 0;
    cur.siteId = a.siteId;
    cur.crewId = a.crewId;
    agg.set(a.personId, cur);
  }

  const rows: WageSummaryRow[] = [];
  let grossT = 0;
  let advT = 0;
  for (const [personId, x] of agg) {
    const rate = rateOf.get(personId) ?? defaultRateOf.get(personId) ?? 0;
    const base = Math.round(rate * (x.present + 0.5 * x.half));
    const otPay = Math.round(x.ot * (rate / 8) * otMultiplier);
    const gross = base + otPay;
    const advance = advanceOf.get(personId) ?? 0;
    const net = gross - advance;
    grossT += gross;
    advT += advance;
    rows.push({
      personId,
      personName: nameOf.get(personId) ?? '(unknown)',
      crewId: x.crewId,
      siteId: x.siteId,
      presentDays: x.present,
      halfDays: x.half,
      otHours: x.ot,
      ratePaise: rate,
      grossPayablePaise: gross,
      advancePaise: advance,
      netPayablePaise: net,
    });
  }
  rows.sort((a, b) => a.personName.localeCompare(b.personName));
  return { rows, totals: { grossPaise: grossT, advancePaise: advT, netPaise: grossT - advT } };
}
