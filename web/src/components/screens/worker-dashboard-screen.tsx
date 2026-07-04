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
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleUserRound } from 'lucide-react';
import type { Attendance, AttendanceStatus, Person, Site } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { cn } from '@/lib/utils';

const STATUS_TEXT_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: 'text-emerald-700 dark:text-emerald-400',
  HALF_DAY: 'text-amber-800 dark:text-amber-400',
  ABSENT: 'text-destructive',
};

export function WorkerDashboardScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);
  const monthStart = `${today.slice(0, 7)}-01`;

  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });

  // Scoped lists: exactly one person row (self) and their assigned site.
  const person = peopleQ.data?.[0];
  const site = sitesQ.data?.[0];

  const attendanceQ = useQuery({
    queryKey: ['attendance', site?.id, monthStart, today],
    queryFn: () => {
      const qs = new URLSearchParams({ siteId: site!.id, from: monthStart, to: today });
      return api<Attendance[]>('GET', `/attendance?${qs}`);
    },
    enabled: !!site,
  });

  const rows = useMemo(
    () => [...(attendanceQ.data ?? [])].sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1)),
    [attendanceQ.data],
  );
  const count = (s: AttendanceStatus) => rows.filter((r) => r.status === s).length;

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

      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.workerAttTitle}</CardTitle>
          <CardDescription>{m.DASH_UI.workerAttSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid min-h-24 content-start gap-3">
          {sitesQ.isPending || (!!site && attendanceQ.isPending) ? (
            <LoadingState />
          ) : attendanceQ.error ? (
            <ErrorState error={attendanceQ.error} onRetry={() => void attendanceQ.refetch()} />
          ) : !site || rows.length === 0 ? (
            <EmptyState label={m.DASH_UI.workerAttEmpty} />
          ) : (
            <>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" data-testid="worker-att-counts">
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.PRESENT}{' '}
                  <span className="font-medium tabular-nums" data-testid="worker-present-count">
                    {count('PRESENT')}
                  </span>
                </li>
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.HALF_DAY} <span className="font-medium tabular-nums">{count('HALF_DAY')}</span>
                </li>
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.ABSENT} <span className="font-medium tabular-nums">{count('ABSENT')}</span>
                </li>
              </ul>
              <ul className="divide-y" data-testid="worker-att-list">
                {rows.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-sm">{formatBusinessDateShort(a.businessDate)}</span>
                    <span className={cn('text-sm font-medium', STATUS_TEXT_CLASS[a.status])}>
                      {m.ATTENDANCE_STATUS_LABELS[a.status]}
                      {a.otHours > 0 && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {m.OWNER_UI.otPrefix} {a.otHours}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-muted-foreground">{m.DASH_UI.workerViewOnly}</p>
        </CardContent>
      </Card>
    </div>
  );
}
