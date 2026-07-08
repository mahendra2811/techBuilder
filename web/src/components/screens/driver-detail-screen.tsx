'use client';

/**
 * WO-12 driver drill-down (Owner + Site Manager — one component, two thin route
 * wrappers under owner/fleet/driver/[id] and site-manager/fleet/driver/[id]).
 * Reached from a vehicle's detail page ("view driver details") — GET
 * /users/:id/driver-detail is scope-enforced server-side.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { DriverDetail } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDateShort } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';

export function DriverDetailScreen({ driverUserId, backHref }: { driverUserId: string; backHref: string }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;

  const detailQ = useQuery({
    queryKey: ['users', driverUserId, 'driver-detail'],
    queryFn: () => api<DriverDetail>('GET', `/users/${driverUserId}/driver-detail`),
  });

  return (
    <div className="grid gap-4" data-testid="driver-detail">
      <Link
        href={backHref}
        data-testid="driver-detail-back"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {w.driverDetailBack}
      </Link>

      <Card>
        <CardHeader>
          {detailQ.isPending ? (
            <LoadingState />
          ) : detailQ.error ? (
            <ErrorState error={detailQ.error} onRetry={() => void detailQ.refetch()} />
          ) : detailQ.data ? (
            <CardTitle data-testid="driver-detail-title">{detailQ.data.user.name}</CardTitle>
          ) : (
            <EmptyState label={w.driverNotFound} />
          )}
        </CardHeader>

        {detailQ.data && (
          <CardContent className="grid gap-4">
            <div className="grid gap-1 text-sm">
              <p data-testid="driver-detail-phone">
                {w.driverPhoneLabel}: {detailQ.data.user.phone ?? '—'}
              </p>
              <p data-testid="driver-detail-vehicle">
                {w.driverVehicleLabel}:{' '}
                {detailQ.data.vehicle
                  ? `${detailQ.data.vehicle.regNo}${detailQ.data.vehicle.name ? ` · ${detailQ.data.vehicle.name}` : ''}`
                  : w.driverNoVehicle}
              </p>
            </div>

            <Separator />

            <div className="grid gap-2">
              <p className="text-sm font-medium">{w.logsTitle}</p>
              {detailQ.data.logs.length === 0 ? (
                <EmptyState label={w.logsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="driver-detail-logs">
                  {detailQ.data.logs.map((l) => (
                    <li key={l.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {formatBusinessDateShort(l.businessDate)} · {l.startReading}
                        {l.endReading != null ? ` → ${l.endReading}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="grid gap-2">
              <p className="text-sm font-medium">{w.fuelTitle}</p>
              {detailQ.data.fuel.length === 0 ? (
                <EmptyState label={w.fuelEmpty} />
              ) : (
                <ul className="divide-y" data-testid="driver-detail-fuel">
                  {detailQ.data.fuel.map((f) => (
                    <li key={f.id} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                      <span>
                        {formatBusinessDateShort(f.businessDate)} · {f.litres} {w.fuelLitresSuffix}
                      </span>
                      <span className="font-medium">{formatPaise(f.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="grid gap-2">
              <p className="text-sm font-medium">{w.tripsTitle}</p>
              {detailQ.data.trips.length === 0 ? (
                <EmptyState label={w.tripsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="driver-detail-trips">
                  {detailQ.data.trips.map((t) => (
                    <li key={t.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {t.fromText} → {t.toText}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatBusinessDateShort(t.businessDate)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="grid gap-2">
              <p className="text-sm font-medium">{w.driverExpensesTitle}</p>
              {detailQ.data.expenses.length === 0 ? (
                <EmptyState label={w.driverExpensesEmpty} />
              ) : (
                <ul className="divide-y" data-testid="driver-detail-expenses">
                  {detailQ.data.expenses.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                      <span>
                        {m.EXPENSE_CATEGORY_LABELS[e.category]}
                        {e.billNo ? ` · ${e.billNo}` : ''} · {formatBusinessDateShort(e.businessDate)}
                      </span>
                      <span className="font-medium">{formatPaise(e.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
