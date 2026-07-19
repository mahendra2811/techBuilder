import type { MoneyTag, Role } from '@techbuilder/contracts';

/** Any role that can hand cash down the chain — union of khata-screen's + ledger-screen's caller sets. */
export type MoneyGiverRole = 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR' | 'ACCOUNTANT';

/** Roles BELOW each caller — who they may hand cash to (mirrors the backend's GIVE hierarchy check). */
export const TARGET_ROLES: Record<MoneyGiverRole, readonly Role[]> = {
  OWNER: ['SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'],
  SITE_MANAGER: ['SUPERVISOR', 'DRIVER', 'WORKER'],
  SUPERVISOR: ['WORKER'],
  ACCOUNTANT: ['SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'],
};

/**
 * BUG FIX (2026-07-18): Round 2 made SUPERVISOR NOT a cash node for WORK-tagged
 * transfers — the backend (`cash-transfers.service.ts` `create()`) throws FORBIDDEN
 * the moment either party of a `tag==='WORK'` transfer is a SUPERVISOR ("Supervisors
 * are outside the work-cash chain (Round 2) — money requests only"). `TARGET_ROLES`
 * above still lists SUPERVISOR (correctly — he IS a valid salary/personal recipient),
 * so callers must filter him out of WORK candidates specifically. Salary/Personal
 * (`tag !== 'WORK'`) has no such restriction.
 */
export function candidateRoles(role: MoneyGiverRole, tag: MoneyTag): readonly Role[] {
  return tag === 'WORK' ? TARGET_ROLES[role].filter((r) => r !== 'SUPERVISOR') : TARGET_ROLES[role];
}
