/**
 * Shared shell for the 5 role areas — mobile-first top bar with org name,
 * role badge, user name and logout, plus the RBAC-driven nav (Phase 2).
 * Nav destinations are Phase-3 placeholder routes; only visibility is real.
 */
import type { Org, Role, User } from '@techbuilder/contracts';
import { ROLE_LABEL } from '@/lib/roles';
import { UI } from '@/lib/messages';
import { LogoutButton } from './logout-button';
import { RoleNav } from './role-nav';

export function RoleShell({
  role,
  user,
  org,
  children,
}: {
  role: Role;
  user: User;
  org: Org;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{org.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span
                className="mr-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                data-testid="role-badge"
              >
                {ROLE_LABEL[role]}
              </span>
              {UI.loggedInAs} {user.name}
            </p>
          </div>
          <LogoutButton />
        </div>
        <RoleNav role={role} />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
