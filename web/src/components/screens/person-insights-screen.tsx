'use client';

/**
 * WO-13 per-person drill-down (Owner + SM + TH — one component, three thin route
 * wrappers under {role}/people/[id]). Reached from a people-screen row. GET
 * /insights/person/:id is scope-enforced server-side (SM: person must be a user
 * of his site; TH: person must be in his own crew; Owner: any).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { PersonInsights, UUID } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDate, todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { DatePresets, type DateRange } from '@/components/insights/date-presets';
import { ProgressList, ExpenseList, RequestList } from '@/components/insights/record-lists';
import { PeriodSummary } from '@/components/insights/period-summary';

export function PersonInsightsScreen({ userId, backHref }: { userId: UUID; backHref: string }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  const today = useMemo(() => todayKolkata(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });

  const insightsQ = useQuery({
    queryKey: ['insights', 'person', userId, range.from, range.to],
    queryFn: () => api<PersonInsights>('GET', `/insights/person/${userId}?from=${range.from}&to=${range.to}`),
  });

  // The target's own name resolves everything they entered/requested; other actors
  // (e.g. who decided a request) fall back to a generic label — insights/person has
  // no scoped user directory of its own the way the site-wide screen does.
  const userName = (id: UUID) => (id === userId ? (insightsQ.data?.name ?? i.unknownUser) : i.unknownUser);

  return (
    <div className="grid gap-4" data-testid="person-insights">
      <Link
        href={backHref}
        data-testid="person-insights-back"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {i.personBack}
      </Link>

      <Card>
        <CardHeader>
          {insightsQ.isPending ? (
            <LoadingState />
          ) : insightsQ.error ? (
            <ErrorState error={insightsQ.error} onRetry={() => void insightsQ.refetch()} />
          ) : (
            <CardTitle data-testid="person-insights-name">{insightsQ.data?.name ?? i.personTitle}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <DatePresets today={today} value={range} onChange={setRange} testIdPrefix="person-insights-date" />
        </CardContent>
      </Card>

      {insightsQ.data && (
        <>
          <Card data-testid="person-insights-totals-card">
            <CardHeader>
              <CardTitle>{i.personTotalsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <PeriodSummary totals={insightsQ.data.totals} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{i.personDaysTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {insightsQ.data.days.every((d) => d.progress.length === 0 && d.expenses.length === 0 && d.requests.length === 0) ? (
                <EmptyState label={i.periodEmpty} />
              ) : (
                insightsQ.data.days.map((d) => (
                  <div key={d.businessDate} className="grid gap-2 rounded-lg border border-input p-3" data-testid={`person-insights-day-${d.businessDate}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{formatBusinessDate(d.businessDate)}</p>
                      {d.noProgress && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                          {i.noProgressBanner}
                        </span>
                      )}
                    </div>
                    <Separator />
                    <div className="grid gap-2">
                      <p className="text-xs font-medium text-muted-foreground">{i.progressTitle}</p>
                      <ProgressList notes={d.progress} userName={userName} />
                    </div>
                    <div className="grid gap-2">
                      <p className="text-xs font-medium text-muted-foreground">{i.expensesTitle}</p>
                      <ExpenseList expenses={d.expenses} userName={userName} />
                    </div>
                    <div className="grid gap-2">
                      <p className="text-xs font-medium text-muted-foreground">{i.requestsTitle}</p>
                      <RequestList requests={d.requests} userName={userName} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
