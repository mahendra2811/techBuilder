'use client';

/**
 * RBAC-driven navigation for the role shell (Phase 2).
 * Mobile-first horizontally-scrollable pill bar; items come from
 * navItemsFor(role) — i.e. only actions the role can() perform.
 * Destinations (except Dashboard) are Phase-3 placeholder routes.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@techbuilder/contracts';
import { navItemsFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function RoleNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsFor(role);

  return (
    <nav data-testid="role-nav" aria-label="Primary" className="border-t">
      <div className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.action}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              data-testid={item.testId}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
