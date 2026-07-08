'use client';

/**
 * Team-head dashboard (/team-head) — composed ONLY from the TH's own scoped
 * list reads: GET /sites (their crew's site), GET /people (their crew),
 * GET /attendance (crew-filtered server-side) and GET /records/progress.
 * NEVER calls /dashboards/owner or /completeness — those are OWNER +
 * SITE_MANAGER only (backend throws FORBIDDEN for TEAM_HEAD).
 *
 * Answers the TH's two daily questions — "have I marked everyone?" and "did I
 * write today's note?" — then shortcuts to the screens where they act.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, ClipboardCheck, NotebookPen, Send, Users } from 'lucide-react';
import type { Attendance, Person, ProgressNote, Site, UUID } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KhataCard } from '@/components/khata-card';
import { SitePicker } from '@/components/entry/site-picker';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';

export function TeamHeadDashboardScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

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

      <SitePicker sites={sites} isLoading={sitesQ.isPending} value={siteId} onChange={setPickedSiteId} />

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
          <Link href="/team-head/insights" data-testid="th-crew-today-link" className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.INSIGHTS_UI.crewTodayStripTitle}</p>
              <p className="truncate text-xs text-muted-foreground">{m.INSIGHTS_UI.crewTodayStripSubtitle}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      <QuickActions
        actions={[
          { href: '/team-head/attendance', label: m.NAV_LABELS.attendance, icon: ClipboardCheck, testId: 'qa-attendance' },
          { href: '/team-head/records', label: m.NAV_LABELS.records, icon: NotebookPen, testId: 'qa-records' },
          { href: '/team-head/requests', label: m.NAV_LABELS.requests, icon: Send, testId: 'qa-requests' },
          { href: '/team-head/approvals', label: m.NAV_LABELS.approvals, icon: BadgeCheck, testId: 'qa-approvals' },
          { href: '/team-head/people', label: m.NAV_LABELS.people, icon: Users, testId: 'qa-people' },
        ]}
      />
    </div>
  );
}
