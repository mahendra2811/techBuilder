/**
 * Client-side mirror of the backend user-creation cascade (WP-1).
 *
 * The backend `CAN_CREATE` map (backend/src/users/users.service.ts) is the
 * AUTHORITATIVE gate; this table only pre-limits the role picker in the People
 * screen so a creator is never offered a role the server would reject. Like
 * `business-date.ts` mirrors the backdating window, this mirrors a backend
 * policy — it is NOT a contracts type (there is no `CAN_CREATE` in
 * `@techbuilder/contracts`), so it lives here rather than being imported.
 *
 * Deliberately a strict subset of the backend map: we never offer OWNER→OWNER
 * (owners are onboarded by the developer, not created in-app).
 */
import type { Role } from '@techbuilder/contracts';

export const CREATABLE_ROLES: Record<Role, Role[]> = {
  OWNER: ['SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'],
  SITE_MANAGER: ['TEAM_HEAD', 'DRIVER', 'WORKER'],
  TEAM_HEAD: ['WORKER', 'DRIVER'],
  DRIVER: [],
  WORKER: [],
};

/** A crypto-random, human-readable temporary password (unambiguous chars, ≥8 to satisfy the backend). */
export function makeTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const n of bytes) s += chars[n % chars.length];
  return `tb-${s}`;
}
