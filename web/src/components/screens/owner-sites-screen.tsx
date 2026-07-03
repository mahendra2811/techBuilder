'use client';

/**
 * Owner site list (/owner/sites) — name, code, TODAY's completeness state
 * (text + color, never color alone), tap through to the read-only drill-in.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { Completeness, Site } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { OWNER_UI } from '@/lib/messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CompletenessBadge } from '@/components/owner/completeness';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';

export function OwnerSitesScreen() {
  const today = useMemo(() => todayKolkata(), []);
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const compQ = useQuery({
    queryKey: ['completeness', today, today],
    queryFn: () => api<Completeness[]>('GET', `/completeness?from=${today}&to=${today}`),
  });

  return (
    <Card data-testid="owner-sites">
      <CardHeader>
        <CardTitle>{OWNER_UI.sitesTitle}</CardTitle>
        <CardDescription>{OWNER_UI.sitesSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {sitesQ.isPending || compQ.isPending ? (
          <LoadingState />
        ) : sitesQ.error ? (
          <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
        ) : compQ.error ? (
          <ErrorState error={compQ.error} onRetry={() => void compQ.refetch()} />
        ) : !sitesQ.data || sitesQ.data.length === 0 ? (
          <EmptyState label={OWNER_UI.sitesEmpty} />
        ) : (
          <ul className="divide-y">
            {sitesQ.data.map((s) => {
              const todayState = compQ.data?.find((c) => c.scopeId === s.id && c.businessDate === today)?.state;
              return (
                <li key={s.id}>
                  <Link
                    href={`/owner/sites/${s.id}`}
                    data-testid={`site-row-${s.id}`}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.code}</p>
                    </div>
                    <CompletenessBadge state={todayState} testId={`site-state-${s.id}`} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
