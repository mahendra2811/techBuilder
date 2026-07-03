import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/backend';
import { roleHome } from '@/lib/roles';

/** Root — pure router: session → role home (via change-password gate), else /login. */
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');
  redirect(roleHome(session.user.role));
}
