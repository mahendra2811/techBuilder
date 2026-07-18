'use client';

/**
 * WO-11 driver surface, slimmed to switch-only (DRV-2, docs/role-page-map/driver/
 * driver-role-updates.md, frozen.10): self-switch onto another vehicle at the same
 * site (instant, when the target's TYPE is on the driver's allowed list). Lives on
 * /driver/vehicle. The damage-report form + history that used to live here moved to
 * their own page — see `driver-damage-screen.tsx` (/driver/damage) — and the fuel
 * entry moved to `driver-fuel-screen.tsx` (/driver/fuel); this page no longer stacks
 * either of them (see driver/vehicle/page.tsx).
 *
 * "Needs approval" vehicles deep-link to the existing VEHICLE_SWITCH request form on
 * /driver/requests (RequestsScreen — owned by another wave) via a same-page anchor;
 * that screen is not touched here.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Vehicle, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

/** Round 2 (CW-9) copy: switching onto an ALLOWED type is log-only (no approval flow) —
 *  make that explicit, and name both people who now get the widened notification. Module-local
 *  per convention (never edit the shared i18n catalogs for this). */
const UI = {
  en: {
    logOnlyNotice: 'No approval needed — your supervisor and the site manager will be informed automatically.',
  },
  hi: {
    logOnlyNotice: 'मंज़ूरी की ज़रूरत नहीं — आपके सुपरवाइज़र और साइट मैनेजर को अपने आप सूचना मिल जाएगी।',
  },
};

export function VehicleSwitchScreen() {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const snapshotQ = useQuery({
    queryKey: ['vehicles', 'my-snapshot'],
    queryFn: () => api<VehicleSnapshot>('GET', '/vehicles/my-snapshot'),
    retry: false, // NOT_FOUND ("no vehicle yet") is an expected empty state, not a transient failure
  });
  const vehicle = snapshotQ.data?.vehicle ?? null;
  const noVehicle = snapshotQ.error instanceof ApiClientError && snapshotQ.error.code === 'NOT_FOUND';

  const vehiclesQ = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api<Vehicle[]>('GET', '/vehicles'),
    enabled: !!vehicle,
  });

  const allowedTypes = new Set(meQ.data?.user.allowedVehicleTypeIds ?? []);
  const otherVehicles = (vehiclesQ.data ?? []).filter((v) => v.id !== vehicle?.id);

  const invalidateAfterSwitch = () => {
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  return (
    <div className="grid gap-4" data-testid="vehicle-switch-screen">
      <Card>
        <CardHeader>
          <CardTitle>{w.switchTitle}</CardTitle>
          <CardDescription>{w.switchSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshotQ.isPending || meQ.isPending ? (
            <LoadingState />
          ) : noVehicle ? (
            <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
          ) : snapshotQ.error ? (
            <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
          ) : vehiclesQ.isPending ? (
            <LoadingState />
          ) : vehiclesQ.error ? (
            <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
          ) : otherVehicles.length === 0 ? (
            <EmptyState label={w.switchListEmpty} />
          ) : (
            <>
              {otherVehicles.some((v) => allowedTypes.has(v.vehicleTypeId)) && (
                <Notice tone="success" testId="switch-log-only-notice">
                  {ui.logOnlyNotice}
                </Notice>
              )}
              <ul className="divide-y" data-testid="switch-vehicle-list">
                {otherVehicles.map((v) => (
                  <SwitchVehicleRow
                    key={v.id}
                    vehicle={v}
                    allowed={allowedTypes.has(v.vehicleTypeId)}
                    onSwitched={invalidateAfterSwitch}
                  />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch section: one row per other site vehicle
// ---------------------------------------------------------------------------

function SwitchVehicleRow({
  vehicle,
  allowed,
  onSwitched,
}: {
  vehicle: Vehicle;
  allowed: boolean;
  onSwitched: () => void;
}) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [done, setDone] = useState(false);

  const doSwitch = useMutation({
    mutationFn: () => api<Vehicle>('POST', `/vehicles/${vehicle.id}/switch`),
    onSuccess: () => {
      setDone(true);
      onSwitched();
    },
  });

  const serverError =
    doSwitch.error instanceof ApiClientError
      ? apiErrorMessage(m, doSwitch.error.code)
      : doSwitch.error
        ? apiErrorMessage(m)
        : null;

  return (
    <li className="grid gap-1.5 py-3 first:pt-0 last:pb-0" data-testid={`switch-vehicle-${vehicle.id}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {vehicle.regNo}
          {vehicle.name && <span className="ml-1.5 font-normal text-muted-foreground">· {vehicle.name}</span>}
        </p>
        {allowed ? (
          <Button
            type="button"
            size="sm"
            data-testid={`switch-vehicle-${vehicle.id}-submit`}
            disabled={doSwitch.isPending || done}
            onClick={() => doSwitch.mutate()}
          >
            {doSwitch.isPending ? w.switchNowBusy : w.switchNow}
          </Button>
        ) : (
          <Link
            href="/driver/requests#request-vehicle"
            data-testid={`switch-vehicle-${vehicle.id}-request`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {w.needsApproval}
          </Link>
        )}
      </div>
      {serverError && (
        <Notice tone="error" testId={`switch-vehicle-${vehicle.id}-error`}>
          {serverError}
        </Notice>
      )}
      {done && (
        <Notice tone="success" testId={`switch-vehicle-${vehicle.id}-done`}>
          {w.switchNowDone}
        </Notice>
      )}
    </li>
  );
}
