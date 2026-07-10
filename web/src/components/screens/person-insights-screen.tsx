'use client';

/**
 * WO-13 per-person drill-down (Owner + SM + TH — one component, three thin route
 * wrappers under {role}/people/[id]). Reached from a people-screen row. GET
 * /insights/person/:id is scope-enforced server-side (SM: person must be a user
 * of his site; TH: person must be in his own crew; Owner: any).
 *
 * WO-10 (wave 2): each day collapses to a header row (date + counts + "no
 * progress" flag) and expands on tap — the full progress/expense/request lists
 * render only for the expanded day(s), and only the first DAY_PAGE_SIZE days
 * render at all until "show more days" is tapped. Also mounts the WO-9
 * reset-password action for Owner/SM (never Team Head, never yourself).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import type { PersonInsights, User, UUID } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { CREATABLE_ROLES } from '@/lib/cascade';
import { formatBusinessDate, todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { DatePresets, type DateRange } from '@/components/insights/date-presets';
import { ProgressList, ExpenseList, RequestList } from '@/components/insights/record-lists';
import { PeriodSummary } from '@/components/insights/period-summary';
import { ResetPasswordAction } from '@/components/people/reset-password-action';
import { cn } from '@/lib/utils';

type PeopleRole = 'OWNER' | 'SITE_MANAGER' | 'TEAM_HEAD';
const DAY_PAGE_SIZE = 7;

export function PersonInsightsScreen({ userId, backHref, role }: { userId: UUID; backHref: string; role: PeopleRole }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  const today = useMemo(() => todayKolkata(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const insightsQ = useQuery({
    queryKey: ['insights', 'person', userId, range.from, range.to],
    queryFn: () => api<PersonInsights>('GET', `/insights/person/${userId}?from=${range.from}&to=${range.to}`),
  });
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  // The target's own name resolves everything they entered/requested; other actors
  // (e.g. who decided a request) fall back to a generic label — insights/person has
  // no scoped user directory of its own the way the site-wide screen does.
  const userName = (id: UUID) => (id === userId ? (insightsQ.data?.name ?? i.unknownUser) : i.unknownUser);

  const targetUser = usersQ.data?.find((u) => u.id === userId);
  // Mirrors people-screen's canResetPassword: Owner any, SM only roles they may
  // create, never Team Head, never yourself.
  const canResetPassword =
    role !== 'TEAM_HEAD' && userId !== meQ.data?.user.id && !!targetUser && (role === 'OWNER' || CREATABLE_ROLES[role].includes(targetUser.role));

  const toggleDay = (date: string) =>
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const daySummary = (d: PersonInsights['days'][number]): string => {
    const parts: string[] = [];
    if (d.progress.length > 0) parts.push(`${d.progress.length} ${i.daySummaryProgress}`);
    if (d.expenses.length > 0) parts.push(`${d.expenses.length} ${i.daySummaryExpense}`);
    if (d.requests.length > 0) parts.push(`${d.requests.length} ${i.daySummaryRequest}`);
    return parts.length > 0 ? parts.join(' · ') : i.daySummaryNone;
  };

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
          {canResetPassword && <ResetPasswordAction userId={userId} testIdPrefix="person-insights-reset-password" />}
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
                <ShowMore
                  items={insightsQ.data.days}
                  initial={DAY_PAGE_SIZE}
                  className="grid gap-3"
                  testIdPrefix="person-insights-days"
                  renderItem={(d) => {
                    const isExpanded = expandedDates.has(d.businessDate);
                    return (
                      <div key={d.businessDate} className="rounded-lg border border-input" data-testid={`person-insights-day-${d.businessDate}`}>
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 p-3 text-left"
                          data-testid={`person-insights-day-toggle-${d.businessDate}`}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? i.dayCollapseAria : i.dayExpandAria}
                          onClick={() => toggleDay(d.businessDate)}
                        >
                          <div className="min-w-0 flex-1 grid gap-0.5">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{formatBusinessDate(d.businessDate)}</p>
                              {d.noProgress && (
                                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                                  {i.noProgressBanner}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{daySummary(d)}</p>
                          </div>
                          <ChevronDown
                            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>
                        {isExpanded && (
                          <div className="grid gap-2 border-t border-input p-3">
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.progressTitle}</p>
                              <ProgressList notes={d.progress} userName={userName} />
                            </div>
                            <Separator />
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.expensesTitle}</p>
                              <ExpenseList expenses={d.expenses} userName={userName} />
                            </div>
                            <Separator />
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.requestsTitle}</p>
                              <RequestList requests={d.requests} userName={userName} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
