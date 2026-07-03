import { requireRole } from '@/lib/server/require-session';
import { RoleShell } from '@/components/role-shell';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user, org } = await requireRole('OWNER');
  return (
    <RoleShell role="OWNER" user={user} org={org}>
      {children}
    </RoleShell>
  );
}
