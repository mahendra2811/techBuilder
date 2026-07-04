'use client';

/**
 * Driver dashboard (/driver) — composed ONLY from the driver's own scoped
 * reads: GET /vehicles (their assigned vehicle(s)), GET /vehicle-types (type
 * name for the card) and GET /records/fuel (vehicle-scoped server-side).
 * NEVER calls /dashboards/owner or /completeness — those are OWNER +
 * SITE_MANAGER only (backend throws FORBIDDEN for DRIVER).
 *
 * One job on this screen: see my vehicle + last fill, then hit "Add fuel".
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Fuel, Truck } from 'lucide-react';
import type { FuelLog, UUID, Vehicle, VehicleType } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecentEntries } from '@/components/entry/recent-entries';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { cn } from '@/lib/utils';

export function DriverDashboardScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);

  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const typesQ = useQuery({ queryKey: ['vehicle-types'], queryFn: () => api<VehicleType[]>('GET', '/vehicle-types') });
  const fuelQ = useQuery({
    queryKey: ['records', 'fuel'],
    queryFn: () => {
      const qs = new URLSearchParams({ from: addDays(today, -7), to: today });
      return api<FuelLog[]>('GET', `/records/fuel?${qs}`);
    },
  });

  const vehicles = vehiclesQ.data;
  const typeName = (id: UUID) => typesQ.data?.find((t) => t.id === id)?.name;
  const regNoOf = (id: UUID) => vehicles?.find((v) => v.id === id)?.regNo ?? '';
  /** Rows come newest-first from the backend (ORDER BY createdAt DESC). */
  const lastFuel = fuelQ.data?.[0];

  return (
    <div className="grid gap-4" data-testid="driver-dashboard">
      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.driverVehicleTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-24 content-start gap-3">
          {vehiclesQ.isPending ? (
            <LoadingState />
          ) : vehiclesQ.error ? (
            <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
          ) : !vehicles || vehicles.length === 0 ? (
            <EmptyState label={m.ENTRY_UI.noVehicle} />
          ) : (
            <>
              <ul className="grid gap-2">
                {vehicles.map((v) => (
                  <li
                    key={v.id}
                    data-testid={`driver-vehicle-${v.id}`}
                    className="flex items-center gap-3 rounded-lg border border-input bg-muted/40 px-3 py-2.5"
                  >
                    <Truck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{v.regNo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[v.name, typeName(v.vehicleTypeId)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-sm" data-testid="driver-last-fuel">
                <span className="text-muted-foreground">{m.DASH_UI.driverLastFuel}: </span>
                {fuelQ.isPending ? (
                  '…'
                ) : lastFuel ? (
                  <span className="font-medium">
                    {formatBusinessDateShort(lastFuel.businessDate)} · {lastFuel.litres} {m.OWNER_UI.litresSuffix} ·{' '}
                    {formatPaise(lastFuel.amountPaise)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{m.DASH_UI.driverNoFuelYet}</span>
                )}
              </p>
              <Link
                href="/driver/vehicle"
                data-testid="driver-add-fuel"
                className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'w-full')}
              >
                <Fuel className="size-5" aria-hidden="true" />
                {m.DASH_UI.driverAddFuel}
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <RecentEntries
        testId="recent-fuel"
        isLoading={fuelQ.isPending}
        error={fuelQ.error}
        onRetry={() => void fuelQ.refetch()}
        rows={fuelQ.data?.map((f) => ({
          id: f.id,
          primary: regNoOf(f.vehicleId) || `${f.litres} L`,
          secondary: formatPaise(f.amountPaise),
          tertiary: `${f.businessDate} · ${f.litres} L · ${f.reading}`,
        }))}
      />
    </div>
  );
}
