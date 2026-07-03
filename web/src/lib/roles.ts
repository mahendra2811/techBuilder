/**
 * Role → URL-slug mapping for the 5 role areas.
 * `Role` comes from the frozen contracts — never redefined here.
 */
import type { Role } from '@techbuilder/contracts';

export const ROLE_SLUG: Record<Role, string> = {
  OWNER: 'owner',
  SITE_MANAGER: 'site-manager',
  TEAM_HEAD: 'team-head',
  DRIVER: 'driver',
  WORKER: 'worker',
};

/** Absolute path of a role's home area, e.g. OWNER → "/owner". */
export function roleHome(role: Role): string {
  return `/${ROLE_SLUG[role]}`;
}

/** All protected role-area path prefixes (used by proxy.ts route guarding). */
export const ROLE_AREA_PREFIXES = Object.values(ROLE_SLUG).map((s) => `/${s}`);
