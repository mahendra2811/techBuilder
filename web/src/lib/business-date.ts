/**
 * Client-side business-date helpers (Asia/Kolkata, `YYYY-MM-DD`).
 *
 * The SERVER is authoritative: attendance backdating windows (WP-4) and the org
 * EOD cutoff are enforced in the backend. These helpers only pre-limit the date
 * pickers to the role's window so users rarely hit a server FORBIDDEN.
 */
import { APP_TIMEZONE } from '@techbuilder/contracts';
import type { BusinessDate, Role } from '@techbuilder/contracts';

/** Today's calendar date in Asia/Kolkata (en-CA locale formats as YYYY-MM-DD). */
export function todayKolkata(now: Date = new Date()): BusinessDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now);
}

/** ISO date ± n days (UTC-safe on YYYY-MM-DD strings). */
export function addDays(isoDate: BusinessDate, n: number): BusinessDate {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO instant → "03 Jul, 12:44" in Asia/Kolkata (audit chips). */
export function formatKolkataDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Business date (YYYY-MM-DD) → "03 Jul 2026" (digest header, headings). */
export function formatBusinessDate(date: BusinessDate): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC', // parse the plain date as-is; no instant math involved
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Business date → "03 Jul" (compact list rows). */
export function formatBusinessDateShort(date: BusinessDate): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Every date in [from..to] inclusive (completeness dot rows). */
export function eachDate(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  const out: BusinessDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * How many days back each role may enter/correct (mirrors the backend WP-4
 * policy for attendance; applied to all entry forms for consistent UX).
 * OWNER is unlimited (absent). DRIVER gets the conservative TH window.
 */
const BACKDATE_LIMIT_DAYS: Partial<Record<Role, number>> = {
  SUPERVISOR: 1, // frozen.10 (D1/SUP-3): today + yesterday only (was 2; org thBackdateDays default is now 1)
  SITE_MANAGER: 7,
  DRIVER: 2,
};

/** Earliest selectable entry date for a role (undefined = unlimited). */
export function minEntryDate(role: Role, today: BusinessDate): BusinessDate | undefined {
  const limit = BACKDATE_LIMIT_DAYS[role];
  return limit === undefined ? undefined : addDays(today, -limit);
}

/**
 * Days-back a role may file a record for — the count that drives the <DateSelect> dropdown.
 * MUST match the backend RECORD_CREATE_BACKDATE_LIMIT_DAYS so every offered option is accepted
 * (SUPERVISOR 1 = today+yesterday, SITE_MANAGER 7, DRIVER 2). OWNER is unlimited server-side; a
 * dropdown can't be infinite, so it's capped to a sensible 7 for the picker (Owner rarely
 * backdates, and can be given a wider affordance later if needed).
 */
const OWNER_PICKER_BACKDATE = 7;
export function backdateDaysFor(role: Role): number {
  return BACKDATE_LIMIT_DAYS[role] ?? OWNER_PICKER_BACKDATE;
}
