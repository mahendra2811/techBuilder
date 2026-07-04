'use client';

/**
 * Quick-action link grid for the role dashboards — big tappable shortcuts to
 * the role's entry screens. Labels come from NAV_LABELS (same wording as the
 * nav bar) so the shortcut and the nav item always read identically.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  testId: string;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const m = useMessages();
  return (
    <Card data-testid="quick-actions">
      <CardHeader>
        <CardTitle>{m.DASH_UI.quickActions}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              data-testid={a.testId}
              className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <a.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 truncate">{a.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
