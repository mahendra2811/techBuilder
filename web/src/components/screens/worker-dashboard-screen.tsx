'use client';

/**
 * Worker dashboard (/worker) — the ONLY worker screen; strictly read-only
 * (view.all = SELF). Composed from the worker's own scoped reads: GET /people
 * (their own person row), GET /sites (their assigned site) and GET /attendance
 * (server returns only their own rows). NEVER calls /dashboards/owner or
 * /completeness — those are OWNER + SITE_MANAGER only (backend FORBIDDEN).
 *
 * Digital-ID-style card (who am I, where do I work) + this month's attendance
 * so a worker can check their days without asking the team head.
 */
import { useQuery } from '@tanstack/react-query';
import { CircleUserRound } from 'lucide-react';
import type { Person, Site } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { roleHome } from '@/lib/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactPanel } from '@/components/contact-panel';
import { KhataCard } from '@/components/khata-card';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { MyExpenseRequestsSummary } from '@/components/requests/my-requests';

export function WorkerDashboardScreen() {
  const m = useMessages();

  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });

  // Scoped lists: exactly one person row (self) and their assigned site.
  const person = peopleQ.data?.[0];
  const site = sitesQ.data?.[0];

  return (
    <div className="grid gap-4" data-testid="worker-dashboard">
      <Card data-testid="worker-id-card">
        <CardHeader>
          <CardTitle>{m.DASH_UI.workerIdTitle}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-20">
          {peopleQ.isPending || sitesQ.isPending ? (
            <LoadingState />
          ) : peopleQ.error ? (
            <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
          ) : sitesQ.error ? (
            <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
          ) : !person ? (
            <EmptyState label={m.ENTRY_UI.rosterEmpty} />
          ) : (
            <div className="flex items-center gap-4">
              <CircleUserRound className="size-12 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold" data-testid="worker-name">
                  {person.name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  <span className="mr-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    {m.ROLE_LABELS.WORKER}
                  </span>
                  {site ? `${m.ENTRY_UI.site}: ${site.name} (${site.code})` : m.ENTRY_UI.noSites}
                </p>
                {person.phone && <p className="truncate text-xs text-muted-foreground">{person.phone}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <MyExpenseRequestsSummary href={`${roleHome('WORKER')}/requests`} />

      <KhataCard />

      <ContactPanel />
    </div>
  );
}
