/**
 * Shared shell for the 5 role areas — mobile-first top bar with org name,
 * role badge, user name, language toggle (हि/EN) and logout, plus the
 * RBAC-driven nav. Server component: reads the locale cookie per request so
 * SSR HTML and the client (via LocaleProvider) always agree.
 */
import type { Org, Role, User } from "@techbuilder/contracts";
import { getLocale } from "@/lib/server/locale";
import { getMessages } from "@/lib/i18n/messages";
import { LocaleToggle } from "./locale-toggle";
import { LogoutButton } from "./logout-button";
import { RoleNav } from "./role-nav";

export async function RoleShell({
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
  const m = getMessages(await getLocale());
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
                {m.ROLE_LABELS[role]}
              </span>
              {m.UI.loggedInAs} {user.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LocaleToggle />
            <LogoutButton />
          </div>
        </div>
        <RoleNav role={role} />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
