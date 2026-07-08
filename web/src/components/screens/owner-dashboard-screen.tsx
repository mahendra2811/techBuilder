'use client';

/**
 * Owner dashboard (/owner) — where the owner gets value OUT of field data.
 * Also serves as the SITE_MANAGER dashboard (variant="SITE_MANAGER"): the
 * backend auto-scopes GET /dashboards/owner + /completeness (and every list)
 * to the SM's sites, so the same queries render only their slice. SM
 * differences are purely presentational: a heading, quick-action shortcuts,
 * and no per-site drill-in links (the owner-only /owner/sites/[id] screen).
 *
 * - Window toggle Today / 7 / 30 days. `to` is ALWAYS today (Kolkata): the
 *   backend computes the "today" KPIs at window.to, so KPI cards stay "today"
 *   while the cost rollup + completeness cover the chosen window.
 * - Completeness strip: per-site TODAY state (text + color) + a last-7-days dot
 *   row (dedicated 7-day /completeness query so the strip never shrinks when
 *   the "Today" window is selected). Each row links to the site drill-in.
 * - WhatsApp digest (pilot-critical): plain-text summary of TODAY composed
 *   entirely from data this screen already fetched (a today-window dashboard
 *   query + per-site attendance counts) — no new endpoints.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardCheck, Copy, FileSpreadsheet, Fuel, MessageCircle, NotebookPen } from 'lucide-react';
import type { Attendance, Completeness, OwnerDashboard, Site, UUID, Vehicle } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { addDays, formatBusinessDate, todayKolkata } from '@/lib/business-date';
import { buildTodayDigest, whatsappShareUrl, type DigestSiteLine } from '@/lib/digest';
import { useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { formatPaise } from '@/lib/money';
import { roleHome } from '@/lib/roles';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CompletenessBadge, CompletenessDots } from '@/components/owner/completeness';
import { KhataCard } from '@/components/khata-card';
import { WindowToggle } from '@/components/owner/window-toggle';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type DashWindow = 'today' | '7d' | '30d';

const windowOptions = (o: Messages['OWNER_UI']) =>
  [
    { value: 'today', label: o.windowToday },
    { value: '7d', label: o.window7d },
    { value: '30d', label: o.window30d },
  ] as const;

const WINDOW_DAYS_BACK: Record<DashWindow, number> = { today: 0, '7d': 6, '30d': 29 };

export function OwnerDashboardScreen({ variant = 'OWNER' }: { variant?: 'OWNER' | 'SITE_MANAGER' }) {
  const m = useMessages();
  const isOwner = variant === 'OWNER';
  const today = useMemo(() => todayKolkata(), []);
  const [win, setWin] = useState<DashWindow>('7d');
  const from = addDays(today, -WINDOW_DAYS_BACK[win]);
  const dotsFrom = addDays(today, -6);

  const dashboardPath = (f: string) => `/dashboards/owner?from=${f}&to=${today}`;

  const dashQ = useQuery({
    queryKey: ['owner-dashboard', from, today],
    queryFn: () => api<OwnerDashboard>('GET', dashboardPath(from)),
  });
  // Digest is always about TODAY (dedupes with dashQ when the Today window is
  // active). Deferred until the above-fold dashboard query settles — the two
  // aggregate queries otherwise compete on the backend and delay first content
  // (the digest card sits below the fold anyway).
  const todayDashQ = useQuery({
    queryKey: ['owner-dashboard', today, today],
    queryFn: () => api<OwnerDashboard>('GET', dashboardPath(today)),
    enabled: !dashQ.isPending,
  });
  const comp7Q = useQuery({
    queryKey: ['completeness', dotsFrom, today],
    queryFn: () => api<Completeness[]>('GET', `/completeness?from=${dotsFrom}&to=${today}`),
  });
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });

  const sites = sitesQ.data ?? [];
  const attQs = useQueries({
    queries: sites.map((s) => ({
      queryKey: ['attendance', s.id, today, today],
      queryFn: () => api<Attendance[]>('GET', `/attendance?siteId=${s.id}&from=${today}&to=${today}`),
    })),
  });
  /** siteId → attendance rows marked today (undefined while loading/errored). */
  const markedToday = new Map<UUID, number>();
  sites.forEach((s, i) => {
    const data = attQs[i]?.data;
    if (data) markedToday.set(s.id, data.length);
  });

  const kpis = dashQ.data?.kpis;

  return (
    <div className="grid gap-4" data-testid={isOwner ? 'owner-dashboard' : 'sm-dashboard'}>
      {!isOwner && (
        <div>
          <h1 className="text-lg font-semibold">{m.DASH_UI.smTitle}</h1>
          <p className="text-sm text-muted-foreground">{m.DASH_UI.smSubtitle}</p>
        </div>
      )}
      <WindowToggle options={windowOptions(m.OWNER_UI)} value={win} onChange={setWin} testIdPrefix="dash-window" />

      {dashQ.isPending ? (
        // STATIC skeleton with the same geometry as the KPI grid — reserves
        // space (no layout shift) without animation (keeps the viewport
        // visually stable while the live queries resolve).
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true" data-testid="kpi-skeleton">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card size="sm" key={i}>
              <CardContent>
                <div className="h-7 w-14 rounded bg-muted" />
                <div className="mt-1 h-4 w-24 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : dashQ.error ? (
        <ErrorState error={dashQ.error} onRetry={() => void dashQ.refetch()} />
      ) : kpis ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi testId="kpi-headcount" value={String(kpis.headcountToday)} label={m.OWNER_UI.kpiHeadcount} />
          <Kpi testId="kpi-spend" value={formatPaise(kpis.spendTodayPaise)} label={m.OWNER_UI.kpiSpendToday} />
          <Kpi testId="kpi-sites" value={String(kpis.activeSites)} label={m.OWNER_UI.kpiActiveSites} />
          <Kpi testId="kpi-vehicles" value={String(kpis.vehiclesActiveToday)} label={m.OWNER_UI.kpiVehiclesActive} />
          <Kpi testId="kpi-issues" value={String(kpis.openIssues)} label={m.OWNER_UI.kpiOpenIssues} />
          <Kpi testId="kpi-approvals" value={String(kpis.pendingApprovals)} label={m.OWNER_UI.kpiPendingApprovals} />
        </div>
      ) : null}

      {/* My cash khata (WO-9) — one mount covers BOTH the owner home and the
          SM home (/site-manager renders this screen with variant="SITE_MANAGER"). */}
      <KhataCard />

      {/* WO-13: day-wise insights link — role-aware href via the same variant this
          screen already uses for the owner/SM split (roleHome() from the shared
          Role → URL-slug map, not a redefinition of it). */}
      <Card data-testid="insights-link-card">
        <CardContent>
          <Link href={`${roleHome(variant)}/insights`} data-testid="insights-link" className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{m.INSIGHTS_UI.dashboardLinkTitle}</p>
              <p className="truncate text-xs text-muted-foreground">{m.INSIGHTS_UI.dashboardLinkSubtitle}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.OWNER_UI.completenessTitle}</CardTitle>
          <CardDescription>{m.OWNER_UI.completenessSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-28">
          {sitesQ.isPending || comp7Q.isPending ? (
            <RowsSkeleton rows={2} />
          ) : sitesQ.error ? (
            <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
          ) : comp7Q.error ? (
            <ErrorState error={comp7Q.error} onRetry={() => void comp7Q.refetch()} />
          ) : sites.length === 0 ? (
            <EmptyState label={m.OWNER_UI.sitesEmpty} />
          ) : (
            <ul className="divide-y">
              {sites.map((s) => {
                const todayState = comp7Q.data?.find(
                  (c) => c.scopeId === s.id && c.businessDate === today,
                )?.state;
                const marked = markedToday.get(s.id);
                const rowClass = 'flex items-center gap-3 py-3 first:pt-0 last:pb-0';
                const row = (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {s.name} <span className="text-muted-foreground">({s.code})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {marked !== undefined && `${marked} ${m.OWNER_UI.markedSuffix}`}
                      </p>
                    </div>
                    <CompletenessDots rows={comp7Q.data ?? []} siteId={s.id} from={dotsFrom} to={today} />
                    <CompletenessBadge state={todayState} testId={`site-state-${s.id}`} />
                    {isOwner && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </>
                );
                return (
                  <li key={s.id}>
                    {isOwner ? (
                      // Site drill-in exists only in the owner area.
                      <Link href={`/owner/sites/${s.id}`} data-testid={`site-strip-${s.id}`} className={rowClass}>
                        {row}
                      </Link>
                    ) : (
                      <div data-testid={`site-strip-${s.id}`} className={rowClass}>
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.OWNER_UI.costTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-28 content-start gap-4">
          {dashQ.isPending || sitesQ.isPending || vehiclesQ.isPending ? (
            <RowsSkeleton rows={2} />
          ) : dashQ.error ? (
            <ErrorState error={dashQ.error} onRetry={() => void dashQ.refetch()} />
          ) : dashQ.data ? (
            <CostRollupView rollup={dashQ.data.costRollup} sites={sites} vehicles={vehiclesQ.data ?? []} />
          ) : null}
        </CardContent>
      </Card>

      {!isOwner && (
        <QuickActions
          actions={[
            { href: '/site-manager/attendance', label: m.NAV_LABELS.attendance, icon: ClipboardCheck, testId: 'qa-attendance' },
            { href: '/site-manager/records', label: m.NAV_LABELS.records, icon: NotebookPen, testId: 'qa-records' },
            { href: '/site-manager/vehicle', label: m.NAV_LABELS.vehicleFuel, icon: Fuel, testId: 'qa-vehicle' },
            { href: '/site-manager/reports', label: m.NAV_LABELS.reports, icon: FileSpreadsheet, testId: 'qa-reports' },
          ]}
        />
      )}

      <DigestCard
        orgName={meQ.data?.org.name}
        today={today}
        sites={sites}
        vehicles={vehiclesQ.data}
        todayDash={todayDashQ.data}
        markedToday={markedToday}
        ready={
          !!meQ.data &&
          !!todayDashQ.data &&
          !!vehiclesQ.data &&
          sitesQ.isSuccess &&
          attQs.every((q) => q.data !== undefined)
        }
        error={meQ.error ?? todayDashQ.error ?? vehiclesQ.error ?? attQs.find((q) => q.error)?.error ?? null}
        onRetry={() => {
          void meQ.refetch();
          void todayDashQ.refetch();
          void vehiclesQ.refetch();
          attQs.forEach((q) => void q.refetch());
        }}
      />
    </div>
  );
}

/** Static (non-animated) placeholder rows — space is reserved, pixels stay stable. */
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-3 py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="h-4 w-36 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Kpi({ value, label, testId }: { value: string; label: string; testId: string }) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function CostRollupView({
  rollup,
  sites,
  vehicles,
}: {
  rollup: OwnerDashboard['costRollup'];
  sites: Site[];
  vehicles: Vehicle[];
}) {
  const m = useMessages();
  const siteName = (id: UUID) => sites.find((s) => s.id === id)?.name ?? m.OWNER_UI.unknownSite;
  const regNo = (id: UUID) => vehicles.find((v) => v.id === id)?.regNo ?? m.OWNER_UI.unknownVehicle;
  if (rollup.bySite.length === 0 && rollup.byVehicle.length === 0) {
    return <EmptyState label={m.OWNER_UI.costEmpty} />;
  }
  return (
    <>
      {rollup.bySite.length > 0 && (
        <div data-testid="cost-by-site">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{m.OWNER_UI.costBySite}</p>
          <ul className="divide-y">
            {rollup.bySite.map((row) => (
              <li key={row.siteId} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-sm">{siteName(row.siteId)}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatPaise(row.totalPaise)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rollup.byVehicle.length > 0 && (
        <div data-testid="cost-by-vehicle">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{m.OWNER_UI.costByVehicle}</p>
          <ul className="divide-y">
            {rollup.byVehicle.map((row) => (
              <li key={row.vehicleId} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-sm">{regNo(row.vehicleId)}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatPaise(row.totalPaise)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp digest of TODAY
// ---------------------------------------------------------------------------

function DigestCard({
  orgName,
  today,
  sites,
  vehicles,
  todayDash,
  markedToday,
  ready,
  error,
  onRetry,
}: {
  orgName: string | undefined;
  today: string;
  sites: Site[];
  vehicles: Vehicle[] | undefined;
  todayDash: OwnerDashboard | undefined;
  markedToday: Map<UUID, number>;
  ready: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const m = useMessages();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);

  const digest =
    ready && orgName && todayDash && vehicles
      ? buildTodayDigest(
          {
          orgName,
          dateLabel: formatBusinessDate(today),
          sites: sites.map((s): DigestSiteLine => {
            const fuelPaise = todayDash.costRollup.byVehicle
              .filter((r) => vehicles.find((v) => v.id === r.vehicleId)?.assignedSiteId === s.id)
              .reduce((sum, r) => sum + r.totalPaise, 0);
            return {
              code: s.code,
              name: s.name,
              markedCount: markedToday.get(s.id) ?? 0,
              state: todayDash.completeness.find((c) => c.scopeId === s.id && c.businessDate === today)?.state,
              expensePaise: todayDash.costRollup.bySite.find((r) => r.siteId === s.id)?.totalPaise ?? 0,
              fuelPaise,
            };
          }),
          headcountToday: todayDash.kpis.headcountToday,
          spendTodayPaise: todayDash.kpis.spendTodayPaise,
          },
          m,
        )
      : null;

  const copy = async () => {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  };

  return (
    <Card data-testid="digest-card">
      <CardHeader>
        <CardTitle>{m.OWNER_UI.digestTitle}</CardTitle>
        <CardDescription>{m.OWNER_UI.digestSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-56 content-start gap-3">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !digest ? (
          <LoadingState />
        ) : (
          <>
            <pre
              data-testid="digest-preview"
              className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-sans text-xs whitespace-pre-wrap text-muted-foreground"
            >
              {digest}
            </pre>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={whatsappShareUrl(digest)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="digest-whatsapp"
                className={cn(buttonVariants({ variant: 'default' }))}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {m.OWNER_UI.digestShare}
              </a>
              <Button type="button" variant="outline" data-testid="digest-copy" onClick={() => void copy()}>
                <Copy className="size-4" aria-hidden="true" />
                {m.OWNER_UI.digestCopy}
              </Button>
            </div>
            {copied === 'ok' && (
              <Notice tone="success" testId="digest-copied">
                {m.OWNER_UI.digestCopied}
              </Notice>
            )}
            {copied === 'fail' && (
              <Notice tone="warning" testId="digest-copy-failed">
                {m.OWNER_UI.digestCopyFailed}
              </Notice>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
