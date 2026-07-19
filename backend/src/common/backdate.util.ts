/**
 * Backdating windows (WP-4 + Phase-4 web pivot). One shared assert for every
 * businessDate-stamped write: future dates are always rejected; each role may go
 * back only a bounded number of days (OWNER unlimited — audited override).
 * A role absent from a map is unbounded here ONLY because the RBAC action gate
 * already denies it the write entirely (e.g. WORKER never reaches these paths).
 */
import type { Role } from '@techbuilder/contracts';
import { ApiException } from './api-exception';
import { forbidScope } from './scope.util';
import { businessDateNow, daysBetween, kolkataClock } from './business-date';
import { loadEodCutoff } from './org-config.util';
import type { Tx } from '../db/db.service';

/** WP-4: how many days back each role may (re)mark attendance. */
export const ATTENDANCE_BACKDATE_LIMIT_DAYS: Partial<Record<Role, number>> = {
  SUPERVISOR: 2, // ≤48h
  SITE_MANAGER: 7,
  // OWNER: unlimited (audited override)
};

/**
 * Phase-4: creation window for field records (progress/expense/fuel/vehicle-log/
 * trip/material-txn/issue). Same shape as attendance; DRIVER added (vehicle logs).
 * Closes the gap found in web Phase 3A: creates previously accepted ANY past date.
 */
export const RECORD_CREATE_BACKDATE_LIMIT_DAYS: Partial<Record<Role, number>> = {
  SUPERVISOR: 1, // frozen.10 (D1): supervisor entries = today + yesterday only (was 7)
  SITE_MANAGER: 7,
  DRIVER: 2, // fuel narrows this to 0 (today only) at the call site — frozen.10 DRV-4
};

/**
 * Reject future dates outright; reject past dates beyond the role's window.
 *
 * Two DIFFERENT reference dates on purpose:
 *  - FUTURE is judged against the current BUSINESS date (cutoff-aware). An entry can't be dated
 *    past the business day it's being filed in.
 *  - The BACKWARD WINDOW is judged against the CALENDAR date. This matters after the EOD cutoff
 *    (default 20:00 IST): business-"today" has already rolled to the next calendar day, so a
 *    naive `daysBetween(businessDate, businessToday)` counted a legitimate same-evening entry as
 *    1 day of backdating — which made a 0-day window (driver fuel, DRV-4) reject EVERY entry
 *    filed between 20:00 and midnight (the "dead zone"). Measuring backward from the calendar day
 *    fixes that while keeping "today only" true during the day.
 */
export async function assertBackdateWindow(
  tx: Tx,
  role: Role,
  businessDate: string,
  limits: Partial<Record<Role, number>>,
  /** Pass the caller's already-loaded org cutoff to skip a redundant orgs SELECT + parse. */
  cutoff?: string,
): Promise<void> {
  const now = new Date();
  const businessToday = businessDateNow(now, cutoff ?? (await loadEodCutoff(tx)));
  if (daysBetween(businessDate, businessToday) < 0) {
    throw new ApiException('VALIDATION_FAILED', 'Business date cannot be in the future', {
      businessDate: 'future date',
    });
  }
  const back = daysBetween(businessDate, kolkataClock(now).date); // days before the CALENDAR day
  const limit = limits[role];
  if (role !== 'OWNER' && limit !== undefined && back > limit) {
    forbidScope(`Backdating window exceeded: ${role} may go up to ${limit} day(s) back (Owner override required)`);
  }
}
