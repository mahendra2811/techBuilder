'use client';

/**
 * Supervisor dashboard (/supervisor) — composed ONLY from the Supervisor's own scoped
 * list reads: GET /sites (their ONE site — frozen.10 SUP-2 single-site rule) and
 * GET /records/progress. NEVER calls /dashboards/owner or /completeness — those
 * are OWNER + SITE_MANAGER only (backend throws FORBIDDEN for SUPERVISOR).
 *
 * frozen.10 (SUP-10) cleanup: the "Crew card" (attendance headcount) and the
 * "crew today" strip (dead `/supervisor/insights` link) are REMOVED per the
 * client — the underlying attendance capture is untouched server-side, this is
 * a UI-only removal. Site is shown as a fixed label (SUP-2: no site picker —
 * `GET /sites` already returns exactly one site for this role).
 *
 * frozen.10 (SUP-7/D5) addition: a "crew vehicles" card (who's driving what +
 * direct re-allotment) and a damage-report shortcut — see
 * `SupervisorCrewVehiclesCard`.
 *
 * Answers the Supervisor's one remaining daily question — "did I write today's
 * note?" — then shortcuts to the screens where they act.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApprovalRequest, ProgressNote, Site, UUID } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KhataCard } from '@/components/khata-card';
import { ApprovalsPendingCard } from '@/components/dashboard/approvals-pending-card';
import { SupervisorCrewVehiclesCard } from '@/components/dashboard/supervisor-crew-vehicles-card';
import { ContactPanel } from '@/components/contact-panel';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

export function SupervisorDashboardScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  // frozen.10 (SUP-6): the approvals-pending callout is now VEHICLE_SWITCH-only — money
  // requests never reach the supervisor's inbox (they route straight to the accountant).
  const pendingRequestsQ = useQuery({
    queryKey: ['requests', 'PENDING'],
    queryFn: () => api<ApprovalRequest[]>('GET', '/requests?status=PENDING'),
  });
  const myUserId = meQ.data?.user.id;
  const decidablePending = (pendingRequestsQ.data ?? []).filter(
    (r) => r.type === 'VEHICLE_SWITCH' && r.requestedBy !== myUserId,
  ).length;

  // frozen.10 (SUP-2): the supervisor has exactly one site — no picker.
  const sites = sitesQ.data;
  const site = sites?.[0];
  const siteId: UUID | '' = site?.id ?? '';

  const progressQ = useQuery({
    queryKey: ['records', 'progress', siteId, today, today],
    queryFn: () => {
      const qs = new URLSearchParams({ siteId, from: today, to: today });
      return api<ProgressNote[]>('GET', `/records/progress?${qs}`);
    },
    enabled: siteId !== '',
  });

  const noteDone = (progressQ.data?.length ?? 0) > 0;

  return (
    <div className="grid gap-4" data-testid="th-dashboard">
      <KhataCard />

      <ApprovalsPendingCard count={decidablePending} href="/supervisor/approvals" />

      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.thProgressTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-14 content-start gap-2">
          {sitesQ.isPending ? (
            <LoadingState />
          ) : sitesQ.error ? (
            <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
          ) : !site ? (
            <EmptyState label={m.ENTRY_UI.noSites} />
          ) : (
            <>
              <p className="text-xs text-muted-foreground" data-testid="th-dashboard-site">
                {site.name} ({site.code})
              </p>
              {progressQ.isPending ? (
                <LoadingState />
              ) : progressQ.error ? (
                <ErrorState error={progressQ.error} onRetry={() => void progressQ.refetch()} />
              ) : (
                <Notice tone={noteDone ? 'success' : 'warning'} testId="th-progress-status">
                  {noteDone ? m.DASH_UI.thProgressDone : m.DASH_UI.thProgressPending}
                </Notice>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* frozen.10 (SUP-7/D5): crew vehicles + re-allotment + damage-report shortcut. */}
      <SupervisorCrewVehiclesCard />

      {/* WO-4 (wave 2): same emergency/contacts footer already used by worker + driver. */}
      <ContactPanel />
    </div>
  );
}
