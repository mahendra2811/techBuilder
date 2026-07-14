/**
 * Role → URL-slug mapping for the role areas.
 * `Role` comes from the frozen contracts — never redefined here.
 */
import type { Role } from '@techbuilder/contracts';

export const ROLE_SLUG: Record<Role, string> = {
  OWNER: 'owner',
  SITE_MANAGER: 'site-manager',
  SUPERVISOR: 'supervisor',
  DRIVER: 'driver',
  WORKER: 'worker',
  // Round-2: no accountant web pages/nav yet (later WO) — slug reserved so the
  // Record<Role, string> stays exhaustive; ROLE_AREA_PREFIXES below picks it up
  // as an unused protected prefix until those pages exist.
  ACCOUNTANT: 'accountant',
};

/** Absolute path of a role's home area, e.g. OWNER → "/owner". */
export function roleHome(role: Role): string {
  return `/${ROLE_SLUG[role]}`;
}

/** All protected role-area path prefixes (used by proxy.ts route guarding). */
export const ROLE_AREA_PREFIXES = Object.values(ROLE_SLUG).map((s) => `/${s}`);
