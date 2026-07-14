'use client';

/**
 * Supervisor dashboard (/supervisor) — composed ONLY from the Supervisor's own scoped
 * list reads: GET /sites (their crew's site), GET /people (their crew),
 * GET /attendance (crew-filtered server-side) and GET /records/progress.
 * NEVER calls /dashboards/owner or /completeness — those are OWNER +
 * SITE_MANAGER only (backend throws FORBIDDEN for SUPERVISOR).
 *
 * Answers the Supervisor's two daily questions — "have I marked everyone?" and "did I
 * write today's note?" — then shortcuts to the screens where they act.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { ApprovalRequest, Attendance, Person, ProgressNote, Site, UUID } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KhataCard } from '@/components/khata-card';
import { MyMoneyCard } from '@/components/my-money-card';
import { ApprovalsPendingCard } from '@/components/dashboard/approvals-pending-card';
import { ContactPanel } from '@/components/contact-panel';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';

export function SupervisorDashboardScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  // WO-3 (wave 2): TH has no dashboard KPI feed, so this counts client-side —
  // mirrors approvals-screen's canDecide rule (VEHICLE_SWITCH/EXPENSE_ADD, never own).
  const pendingRequestsQ = useQuery({
    queryKey: ['requests', 'PENDING'],
    queryFn: () => api<ApprovalRequest[]>('GET', '/requests?status=PENDING'),
  });
  const myUserId = meQ.data?.user.id;
  const decidablePending = (pendingRequestsQ.data ?? []).filter(
    (r) => (r.type === 'VEHICLE_SWITCH' || r.type === 'EXPENSE_ADD') && r.requestedBy !== myUserId,
  ).length;

  // A TH normally has exactly one site — default to the first scoped one (derived, no effect).
  const sites = sitesQ.data;
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');

  const attendanceQ = useQuery({
    queryKey: ['attendance', siteId, today, today],
    queryFn: () => {
      const qs = new URLSearchParams({ siteId, from: today, to: today });
      return api<Attendance[]>('GET', `/attendance?${qs}`);
    },
    enabled: siteId !== '',
  });
  const progressQ = useQuery({
    queryKey: ['records', 'progress', siteId, today, today],
    queryFn: () => {
      const qs = new URLSearchParams({ siteId, from: today, to: today });
      return api<ProgressNote[]>('GET', `/records/progress?${qs}`);
    },
    enabled: siteId !== '',
  });

  const people = peopleQ.data ?? [];
  const rows = attendanceQ.data ?? [];
  const count = (s: Attendance['status']) => rows.filter((r) => r.status === s).length;
  const present = count('PRESENT');
  const half = count('HALF_DAY');
  const absent = count('ABSENT');
  const onSite = present + half;
  const unmarked = Math.max(0, people.length - rows.length);
  const noteDone = (progressQ.data?.length ?? 0) > 0;

  return (
    <div className="grid gap-4" data-testid="th-dashboard">
      <KhataCard />

      <MyMoneyCard />

      <ApprovalsPendingCard count={decidablePending} href="/supervisor/approvals" />

      <SitePicker
        sites={sites}
        isLoading={sitesQ.isPending}
        value={siteId}
        onChange={setPickedSiteId}
        error={sitesQ.error}
        onRetry={() => void sitesQ.refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.thCrewTitle}</CardTitle>
          <CardDescription>{m.DASH_UI.thCrewSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid min-h-24 content-start gap-3">
          {sitesQ.isPending || peopleQ.isPending || (siteId !== '' && attendanceQ.isPending) ? (
            <LoadingState />
          ) : peopleQ.error ? (
            <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
          ) : attendanceQ.error ? (
            <ErrorState error={attendanceQ.error} onRetry={() => void attendanceQ.refetch()} />
          ) : people.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground" data-testid="th-crew-empty">
              {m.ENTRY_UI.rosterEmpty}
            </p>
          ) : (
            <>
              <p data-testid="th-headcount">
                <span className="text-2xl font-semibold tabular-nums">
                  {onSite}/{people.length}
                </span>{' '}
                <span className="text-sm text-muted-foreground">{m.DASH_UI.thOnSiteLabel}</span>
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.PRESENT} <span className="font-medium tabular-nums">{present}</span>
                </li>
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.HALF_DAY} <span className="font-medium tabular-nums">{half}</span>
                </li>
                <li>
                  {m.ATTENDANCE_STATUS_LABELS.ABSENT} <span className="font-medium tabular-nums">{absent}</span>
                </li>
                <li>
                  {m.DASH_UI.thUnmarked}{' '}
                  <span className="font-medium tabular-nums" data-testid="th-unmarked">
                    {unmarked}
                  </span>
                </li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.thProgressTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-14 content-start">
          {sitesQ.isPending || (siteId !== '' && progressQ.isPending) ? (
            <LoadingState />
          ) : progressQ.error ? (
            <ErrorState error={progressQ.error} onRetry={() => void progressQ.refetch()} />
          ) : (
            <Notice tone={noteDone ? 'success' : 'warning'} testId="th-progress-status">
              {noteDone ? m.DASH_UI.thProgressDone : m.DASH_UI.thProgressPending}
            </Notice>
          )}
        </CardContent>
      </Card>

      {/* WO-13: compact link into the day-wise insights screen, scoped to this TH's crew. */}
      <Card data-testid="th-crew-today-strip">
        <CardContent>
          <Link href="/supervisor/insights" data-testid="th-crew-today-link" className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.INSIGHTS_UI.crewTodayStripTitle}</p>
              <p className="truncate text-xs text-muted-foreground">{m.INSIGHTS_UI.crewTodayStripSubtitle}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      {/* WO-4 (wave 2): same emergency/contacts footer already used by worker + driver. */}
      <ContactPanel />
    </div>
  );
}
