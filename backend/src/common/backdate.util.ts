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
import { businessDateNow, daysBetween } from './business-date';
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
  SUPERVISOR: 7, // client-plan v1 (T-2): TH direct entry ≤7 days; older routes as an EXPENSE_ADD request
  SITE_MANAGER: 7,
  DRIVER: 2,
};

/** Reject future dates outright; reject past dates beyond the role's window. */
export async function assertBackdateWindow(
  tx: Tx,
  role: Role,
  businessDate: string,
  limits: Partial<Record<Role, number>>,
  /** Pass the caller's already-loaded org cutoff to skip a redundant orgs SELECT + parse. */
  cutoff?: string,
): Promise<void> {
  const today = businessDateNow(new Date(), cutoff ?? (await loadEodCutoff(tx)));
  const back = daysBetween(businessDate, today); // >0 = past, <0 = future
  if (back < 0) {
    throw new ApiException('VALIDATION_FAILED', 'Business date cannot be in the future', {
      businessDate: 'future date',
    });
  }
  const limit = limits[role];
  if (role !== 'OWNER' && limit !== undefined && back > limit) {
    forbidScope(`Backdating window exceeded: ${role} may go up to ${limit} day(s) back (Owner override required)`);
  }
}
