'use client';

/**
 * Worker dashboard (/worker) — strictly read-only (view.all = SELF). Composed
 * from the worker's own scoped reads: GET /people (their own person row) and
 * GET /attendance (server returns only their own rows). NEVER calls
 * /dashboards/owner or /completeness — those are OWNER + SITE_MANAGER only
 * (backend FORBIDDEN).
 *
 * frozen.9: the ID-card details (site / mobile / guardian) moved to the
 * cross-role /worker/profile page — "My card" here is just a compact link
 * into it (icon + name + role badge + chevron).
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CircleUserRound } from 'lucide-react';
import type { Person } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { roleHome } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { ContactPanel } from '@/components/contact-panel';
import { KhataCard } from '@/components/khata-card';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { MyExpenseRequestsSummary } from '@/components/requests/my-requests';

export function WorkerDashboardScreen() {
  const m = useMessages();

  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  // Scoped list: exactly one person row (self).
  const person = peopleQ.data?.[0];

  return (
    <div className="grid gap-4" data-testid="worker-dashboard">
      <Card data-testid="worker-id-card">
        <CardContent className="min-h-16">
          {peopleQ.isPending ? (
            <LoadingState />
          ) : peopleQ.error ? (
            <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
          ) : !person ? (
            <EmptyState label={m.ENTRY_UI.rosterEmpty} />
          ) : (
            <Link href={`${roleHome('WORKER')}/profile`} className="flex items-center gap-4" data-testid="worker-card-profile-link">
              <CircleUserRound className="size-10 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold" data-testid="worker-name">
                  {person.name}
                </p>
                <span className="inline-block w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {m.ROLE_LABELS.WORKER}
                </span>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
        </CardContent>
      </Card>

      <MyExpenseRequestsSummary href={`${roleHome('WORKER')}/requests`} />

      <KhataCard />

      <ContactPanel />
    </div>
  );
}
