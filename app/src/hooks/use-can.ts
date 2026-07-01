import { can, type Action } from '@techbuilder/contracts';
import { useSession } from '../stores/session';

/** UI-only permission check (server is authoritative). Hides/disables what the role can't do. */
export function useCan(action: Action): boolean {
  const role = useSession((s) => s.user?.role);
  return role ? can(role, action) : false;
}
