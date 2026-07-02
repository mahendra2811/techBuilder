/**
 * Pure completeness rule (WP-5: unit-tested).
 * Per ACTIVE site on a WORKING day (respects weekly_off + site holidays):
 * COMPLETE = attendance AND progress · PARTIAL = one · MISSING = none.
 */
import type { Completeness, DateWindow } from '@techbuilder/contracts';

export interface CompletenessSite {
  id: string;
  status: string; // SiteStatus
  weeklyOff: number[] | null;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let guard = 0;
  while (d <= end && guard < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

export const dow = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export const dayKey = (siteId: string, date: string): string => `${siteId}::${date}`;

export function deriveCompleteness(
  orgId: string,
  sites: CompletenessSite[],
  holidayKeys: Set<string>, // dayKey(siteId, date)
  attendanceKeys: Set<string>, // dayKey(siteId, businessDate)
  progressKeys: Set<string>, // dayKey(siteId, businessDate)
  window: DateWindow,
): Completeness[] {
  const active = sites.filter((s) => s.status === 'ACTIVE');
  const out: Completeness[] = [];
  for (const s of active) {
    const weeklyOff = s.weeklyOff ?? [];
    for (const date of eachDate(window.from, window.to)) {
      if (weeklyOff.includes(dow(date)) || holidayKeys.has(dayKey(s.id, date))) continue;
      const k = dayKey(s.id, date);
      const hasAtt = attendanceKeys.has(k);
      const hasProg = progressKeys.has(k);
      const state = hasAtt && hasProg ? 'COMPLETE' : hasAtt || hasProg ? 'PARTIAL' : 'MISSING';
      out.push({ orgId, scopeType: 'SITE', scopeId: s.id, businessDate: date, state });
    }
  }
  return out;
}
