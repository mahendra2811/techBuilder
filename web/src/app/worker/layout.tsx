import { requireRole } from '@/lib/server/require-session';
import { RoleShell } from '@/components/role-shell';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireRole('WORKER');
  return (
    <RoleShell role="WORKER" user={user} org={org}>
      {children}
    </RoleShell>
  );
}
