import type { UUID, User } from '@techbuilder/contracts';

/** Best-effort name resolution: /users list → self (/me) → shortened id (row may reference a user outside caller's scope). */
export function resolveUserName(id: UUID, users: User[] | undefined, mePayload: { user: User } | undefined): string {
  const listed = users?.find((u) => u.id === id)?.name;
  if (listed) return listed;
  if (mePayload?.user.id === id) return mePayload.user.name;
  return `${id.slice(0, 8)}…`;
}
