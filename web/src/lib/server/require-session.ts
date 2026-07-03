/**
 * Server-component guards for the role areas.
 * proxy.ts already refreshed/bounced obviously-dead sessions; this is the
 * authoritative check (validates the token against the backend via GET /me).
 */
import { redirect } from 'next/navigation';
import type { Role } from '@techbuilder/contracts';
import { getSession, type Session } from './backend';
import { roleHome } from '@/lib/roles';

/** Resolve the session or bounce to /login. Enforces the mustChangePassword gate. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');
  return session;
}

/** Like requireSession, but also pins the area to one role — a user who wanders
 * into another role's area is sent to their own home. */
export async function requireRole(role: Role): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== role) redirect(roleHome(session.user.role));
  return session;
}
