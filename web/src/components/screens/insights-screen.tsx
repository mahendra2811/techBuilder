'use client';

/**
 * WO-13 — date-wise "pick a day, see everything" insights (client plan S-1/T-1/O-1),
 * one component for Owner + Site Manager + Team Head. Backend GET /insights/day and
 * /insights/period are site+scope enforced server-side (OWNER: any site; SM: his
 * sites; TH: his own site, data pre-filtered to his crew's slice) — this screen just
 * renders whatever the server returns.
 *
 * Single-day mode (from === to, the default — "Today"): three blocks — Progress
 * (red "no progress" banner when noProgress), Expenses, Requests.
 * Period mode (a wider preset, e.g. "Last 7 days"): a totals header + a compact
 * day-by-day list; tapping a day switches back into single-day mode for that date.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DayInsights, PeriodTotals, Site, User, UUID } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DatePresets, type DateRange } from '@/components/insights/date-presets';
import { ProgressList, ExpenseList, RequestList } from '@/components/insights/record-lists';
import { PeriodSummary } from '@/components/insights/period-summary';

type InsightsRole = 'OWNER' | 'SITE_MANAGER' | 'TEAM_HEAD';

export function InsightsScreen({ role }: { role: InsightsRole }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  const today = useMemo(() => todayKolkata(), []);

  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');
  const [range, setRange] = useState<DateRange>({ from: today, to: today });

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const userName = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? i.unknownUser;

  const sites = sitesQ.data;
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');
  const isSingleDay = range.from === range.to;

  const dayQ = useQuery({
    queryKey: ['insights', 'day', siteId, range.from],
    queryFn: () => api<DayInsights>('GET', `/insights/day?siteId=${siteId}&date=${range.from}`),
    enabled: siteId !== '' && isSingleDay,
  });
  const periodQ = useQuery({
    queryKey: ['insights', 'period', siteId, range.from, range.to],
    queryFn: () => api<{ totals: PeriodTotals; days: DayInsights[] }>('GET', `/insights/period?siteId=${siteId}&from=${range.from}&to=${range.to}`),
    enabled: siteId !== '' && !isSingleDay,
  });

  return (
    <div className="grid gap-4" data-testid="insights-screen" data-role={role}>
      <Card>
        <CardHeader>
          <CardTitle>{i.title}</CardTitle>
          <CardDescription>{i.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SitePicker sites={sites} isLoading={sitesQ.isPending} value={siteId} onChange={setPickedSiteId} />
          <DatePresets today={today} value={range} onChange={setRange} testIdPrefix="insights-date" />
        </CardContent>
      </Card>

      {siteId === '' ? null : isSingleDay ? (
        <DaySection
          data={dayQ.data}
          isLoading={dayQ.isPending}
          error={dayQ.error}
          onRetry={() => void dayQ.refetch()}
          userName={userName}
        />
      ) : (
        <PeriodSection
          data={periodQ.data}
          isLoading={periodQ.isPending}
          error={periodQ.error}
          onRetry={() => void periodQ.refetch()}
          onSelectDay={(date) => setRange({ from: date, to: date })}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-day mode: three blocks
// ---------------------------------------------------------------------------

function DaySection({
  data,
  isLoading,
  error,
  onRetry,
  userName,
}: {
  data: DayInsights | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  userName: (id: UUID) => string;
}) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  return (
    <>
      <Card data-testid="insights-progress-card">
        <CardHeader>
          <CardTitle>{i.progressTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.noProgress && (
            <Notice tone="error" testId="insights-no-progress">
              {i.noProgressBanner}
            </Notice>
          )}
          <ProgressList notes={data.progress} userName={userName} />
        </CardContent>
      </Card>

      <Card data-testid="insights-expenses-card">
        <CardHeader>
          <CardTitle>{i.expensesTitle}</CardTitle>
          <CardDescription>
            {i.expenseTotalPrefix}: {formatPaise(data.totalExpensePaise)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseList expenses={data.expenses} userName={userName} />
        </CardContent>
      </Card>

      <Card data-testid="insights-requests-card">
        <CardHeader>
          <CardTitle>{i.requestsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestList requests={data.requests} userName={userName} />
        </CardContent>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Period mode: totals header + compact day-by-day list
// ---------------------------------------------------------------------------

function PeriodSection({
  data,
  isLoading,
  error,
  onRetry,
  onSelectDay,
}: {
  data: { totals: PeriodTotals; days: DayInsights[] } | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onSelectDay: (date: string) => void;
}) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  return (
    <>
      <Card>
        <CardContent>
          <PeriodSummary totals={data.totals} />
        </CardContent>
      </Card>

      <Card data-testid="insights-day-list-card">
        <CardHeader>
          <CardTitle>{i.dayListTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.days.length === 0 ? (
            <EmptyState label={i.periodEmpty} />
          ) : (
            <ul className="divide-y" data-testid="insights-day-list">
              {data.days.map((d) => (
                <li key={d.businessDate}>
                  <button
                    type="button"
                    data-testid={`insights-day-row-${d.businessDate}`}
                    onClick={() => onSelectDay(d.businessDate)}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40"
                  >
                    {d.noProgress && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-destructive"
                        aria-hidden="true"
                        data-testid={`insights-day-noprogress-${d.businessDate}`}
                      />
                    )}
                    <span className="flex-1 truncate">{formatBusinessDateShort(d.businessDate)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.progress.length} {i.dayListNoteCount}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatPaise(d.totalExpensePaise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
