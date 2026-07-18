'use client';

/**
 * Driver dashboard (/driver) — the driver's day (reworked per
 * docs/role-page-map/driver/driver-role-updates.md DRV-1/DRV-5, frozen.10):
 *   1. Vehicle snapshot card — GET /vehicles/my-snapshot (own assigned vehicle,
 *      identity + status only — the current/yesterday reading readout is GONE
 *      per client feedback). Instead: THREE traffic-light day-log status chips
 *      (yesterday night / today morning / today evening), derived from today's
 *      + yesterday's GET /records/vehicle-log rows. Tapping ANY chip (or the
 *      "Meter →" row under them) now navigates to the dedicated /driver/meter
 *      page — the Morning/Evening forms no longer render inline here (moved to
 *      `driver-meter-screen.tsx`, DRV-1 open-question Q1 resolved). Chip
 *      colors/tone logic are UNCHANGED — only the tap target changed from a
 *      scroll-into-view to a real navigation.
 *      Also keeps the pending vehicle-switch chip.
 * Recent fuel entries moved to the new /driver/fuel page (D3) — this screen no
 * longer fetches /records/fuel at all.
 * NEVER calls /dashboards/owner or /completeness — those are OWNER + SITE_MANAGER
 * only (backend throws FORBIDDEN for DRIVER).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Truck } from 'lucide-react';
import Link from 'next/link';
import type { VehicleLog, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactPanel } from '@/components/contact-panel';
import { KhataCard } from '@/components/khata-card';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { RequestStatusBadge } from '@/components/requests/request-bits';
import { DayLogChip, type DayLogTone } from '@/components/vehicle/day-log-chip';

/** Module-local bilingual strings (repo convention: messages catalogs are for
 * NAV_LABELS only — screen copy stays local, see DRIVER_FUEL_UI in fuel-screen.tsx). */
const DAY_LOG_UI = {
  en: {
    yesterdayNight: 'Yesterday night',
    todayMorning: 'Today morning',
    todayEvening: 'Today evening',
    filled: 'Filled',
    pending: 'Pending',
    missed: 'Missed',
    meterLink: 'Meter',
  },
  hi: {
    yesterdayNight: 'कल रात',
    todayMorning: 'आज सुबह',
    todayEvening: 'आज शाम',
    filled: 'भरा गया',
    pending: 'बाकी है',
    missed: 'छूट गया',
    meterLink: 'मीटर',
  },
} as const;

export function DriverDashboardScreen() {
  const m = useMessages();
  const locale = useLocale();
  const dayLogUi = DAY_LOG_UI[locale];
  const today = useMemo(() => todayKolkata(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);

  const snapshotQ = useQuery({
    queryKey: ['vehicles', 'my-snapshot'],
    queryFn: () => api<VehicleSnapshot>('GET', '/vehicles/my-snapshot'),
    retry: false, // NOT_FOUND ("no vehicle yet") is an expected empty state, not a transient failure
  });
  const vehicle = snapshotQ.data?.vehicle ?? null;
  const noVehicle = snapshotQ.error instanceof ApiClientError && snapshotQ.error.code === 'NOT_FOUND';

  const todayLogQ = useQuery({
    queryKey: ['records', 'vehicle-log', today],
    queryFn: () => {
      const qs = new URLSearchParams({ from: today, to: today });
      return api<VehicleLog[]>('GET', `/records/vehicle-log?${qs}`);
    },
    enabled: !!vehicle,
  });
  const todayLog = todayLogQ.data?.[0] ?? null;

  // DRV-1: yesterday's log — needed only to derive the "yesterday night" chip
  // (whether that day's evening entry was ever closed out).
  const yesterdayLogQ = useQuery({
    queryKey: ['records', 'vehicle-log', yesterday],
    queryFn: () => {
      const qs = new URLSearchParams({ from: yesterday, to: yesterday });
      return api<VehicleLog[]>('GET', `/records/vehicle-log?${qs}`);
    },
    enabled: !!vehicle,
  });
  const yesterdayLog = yesterdayLogQ.data?.[0] ?? null;

  // Traffic-light day-log chips (DRV-1). While either fetch is loading/errored,
  // all three render muted so we never flash a wrong red/green.
  const dayLogsUnready = todayLogQ.isPending || !!todayLogQ.error || yesterdayLogQ.isPending || !!yesterdayLogQ.error;
  const yesterdayNightTone: DayLogTone = dayLogsUnready
    ? 'warningMuted'
    : yesterdayLog?.endReading != null
      ? 'success'
      : 'error'; // window has passed — missed entries are informational only, no back-fill
  const todayMorningTone: DayLogTone = dayLogsUnready ? 'warningMuted' : todayLog ? 'success' : 'warning';
  const todayEveningTone: DayLogTone = dayLogsUnready
    ? 'warningMuted'
    : todayLog?.endReading != null
      ? 'success'
      : todayLog
        ? 'warning' // morning done, evening still open — actionable
        : 'warningMuted'; // evening can't be actioned before morning exists

  const dayLogStatusLabel = (tone: DayLogTone) =>
    tone === 'success' ? dayLogUi.filled : tone === 'error' ? dayLogUi.missed : dayLogUi.pending;

  return (
    <div className="grid gap-4" data-testid="driver-dashboard">
      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.driverVehicleTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-24 content-start gap-3">
          {snapshotQ.isPending ? (
            <LoadingState />
          ) : noVehicle ? (
            <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
          ) : snapshotQ.error ? (
            <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
          ) : (
            snapshotQ.data && (
              <div className="grid gap-2" data-testid={`driver-vehicle-${snapshotQ.data.vehicle.id}`}>
                <div className="flex items-center gap-3 rounded-lg border border-input bg-muted/40 px-3 py-2.5">
                  <Truck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{snapshotQ.data.vehicle.regNo}</p>
                    {snapshotQ.data.vehicle.name && (
                      <p className="truncate text-xs text-muted-foreground">{snapshotQ.data.vehicle.name}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {m.VEHICLE_STATUS_LABELS[snapshotQ.data.vehicle.status]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2" data-testid="driver-day-log-chips">
                  <DayLogChip
                    label={dayLogUi.yesterdayNight}
                    tone={yesterdayNightTone}
                    statusLabel={dayLogStatusLabel(yesterdayNightTone)}
                    href="/driver/meter"
                    testId="daylog-yesterday-night"
                  />
                  <DayLogChip
                    label={dayLogUi.todayMorning}
                    tone={todayMorningTone}
                    statusLabel={dayLogStatusLabel(todayMorningTone)}
                    href="/driver/meter"
                    testId="daylog-today-morning"
                  />
                  <DayLogChip
                    label={dayLogUi.todayEvening}
                    tone={todayEveningTone}
                    statusLabel={dayLogStatusLabel(todayEveningTone)}
                    href="/driver/meter"
                    testId="daylog-today-evening"
                  />
                </div>

                <Link
                  href="/driver/meter"
                  data-testid="driver-meter-link"
                  className="flex items-center justify-between rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted/40"
                >
                  {dayLogUi.meterLink}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>

                {snapshotQ.data.pendingSwitchRequestId && (
                  <p className="flex items-center gap-1.5" data-testid="driver-pending-switch">
                    <RequestStatusBadge status="PENDING" />
                    <span className="text-xs text-muted-foreground">{m.APPROVAL_TYPE_LABELS.VEHICLE_SWITCH}</span>
                  </p>
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      <KhataCard />

      <ContactPanel />
    </div>
  );
}
