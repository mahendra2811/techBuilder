'use client';

/**
 * WO-12 fleet drill-down (Owner + Site Manager — one component, two thin route
 * wrappers under owner/fleet/[id] and site-manager/fleet/[id]). GET /vehicles/:id/detail
 * is scope-enforced server-side (own-site SM / any-vehicle Owner), so this screen
 * just renders whatever comes back.
 *
 * `expenses` on VehicleDetail is always [] in this schema version — the `expenses`
 * table has no `vehicleId` column, so there is nothing to render for that section
 * (see the module report for the flag). Fuel is the vehicle's real cost signal here.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { Issue, Person, ResolveIssueInput, User, VehicleDetail } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { formatBusinessDateShort } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DamageTimeline } from '@/components/vehicle/damage-timeline';

export function VehicleDetailScreen({ vehicleId, backHref }: { vehicleId: string; backHref: string }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;

  const detailQ = useQuery({
    queryKey: ['vehicles', vehicleId, 'detail'],
    queryFn: () => api<VehicleDetail>('GET', `/vehicles/${vehicleId}/detail`),
  });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  const vehicle = detailQ.data?.vehicle;
  const analytics = detailQ.data?.analytics;
  const driverPersonId = vehicle?.assignedDriverPersonId ?? null;
  const driverPerson = driverPersonId ? peopleQ.data?.find((p) => p.id === driverPersonId) : undefined;
  const driverUser = driverPersonId
    ? usersQ.data?.find((u) => u.personId === driverPersonId && u.role === 'DRIVER')
    : undefined;

  return (
    <div className="grid gap-4" data-testid="vehicle-detail">
      <Link
        href={backHref}
        data-testid="vehicle-detail-back"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {w.vehicleDetailBack}
      </Link>

      <Card>
        <CardHeader>
          {detailQ.isPending ? (
            <LoadingState />
          ) : detailQ.error ? (
            <ErrorState error={detailQ.error} onRetry={() => void detailQ.refetch()} />
          ) : vehicle ? (
            <CardTitle data-testid="vehicle-detail-title">
              {vehicle.regNo}
              {vehicle.name && <span className="ml-1.5 font-normal text-muted-foreground">· {vehicle.name}</span>}
            </CardTitle>
          ) : (
            <EmptyState label={w.vehicleNotFound} />
          )}
        </CardHeader>

        {vehicle && analytics && detailQ.data && (
          <CardContent className="grid gap-5">
            <p className="text-sm" data-testid="vehicle-current-driver">
              {w.currentDriverLabel}: {driverPerson?.name ?? w.noDriverAssigned}
              {driverUser && (
                <Link
                  href={`${backHref}/driver/${driverUser.id}`}
                  data-testid="vehicle-view-driver-link"
                  className="ml-2 text-xs underline"
                >
                  {w.viewDriverLink}
                </Link>
              )}
            </p>

            <Separator />

            <div>
              <p className="mb-2 text-sm font-medium">{w.analyticsTitle}</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label={w.avgRunPerDay7} value={analytics.avgRunPerDay7} noData={w.noData} testId="vehicle-avg-7" />
                <Stat label={w.avgRunPerDay30} value={analytics.avgRunPerDay30} noData={w.noData} testId="vehicle-avg-30" />
                <Stat label={w.avgRunPerDay90} value={analytics.avgRunPerDay90} noData={w.noData} testId="vehicle-avg-90" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{w.fuel30Title}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-fuel-30">
                    {analytics.fuelLitres30} {w.fuelLitresSuffix}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatPaise(analytics.fuelPaise30)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{w.monthlyCostTitle}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-monthly-cost">
                    {formatPaise(analytics.monthlyCostPaise)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{w.totalCostTitle}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-total-cost">
                    {formatPaise(analytics.totalExpensePaise)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <Section title={w.damageHistoryTitle}>
              <DamageTimeline
                issues={detailQ.data.damages}
                isLoading={false}
                testId="vehicle-damage"
                renderExtra={(issue) =>
                  issue.status === 'OPEN' ? (
                    <ResolveIssueInline issue={issue} onResolved={() => void detailQ.refetch()} />
                  ) : null
                }
              />
            </Section>

            <Separator />

            <Section title={w.logsTitle}>
              {detailQ.data.logs.length === 0 ? (
                <EmptyState label={w.logsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-logs">
                  {detailQ.data.logs.map((l) => (
                    <li key={l.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {formatBusinessDateShort(l.businessDate)} · {l.startReading}
                        {l.endReading != null ? ` → ${l.endReading}` : ''}
                      </p>
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Separator />

            <Section title={w.fuelTitle}>
              {detailQ.data.fuel.length === 0 ? (
                <EmptyState label={w.fuelEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-fuel">
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
            </Section>

            <Separator />

            <Section title={w.tripsTitle}>
              {detailQ.data.trips.length === 0 ? (
                <EmptyState label={w.tripsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-trips">
                  {detailQ.data.trips.map((t) => (
                    <li key={t.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {t.fromText} → {t.toText}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBusinessDateShort(t.businessDate)}
                        {t.purpose ? ` · ${t.purpose}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, noData, testId }: { label: string; value: number | null; noData: string; testId: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold" data-testid={testId}>
        {value != null ? value.toFixed(1) : noData}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SM / Owner inline resolve form (shown on OPEN damage reports)
// ---------------------------------------------------------------------------

function ResolveIssueInline({ issue, onResolved }: { issue: Issue; onResolved: () => void }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: (input: ResolveIssueInput) => api<Issue>('POST', `/records/issue/${issue.id}/resolve`, input),
    onSuccess: () => {
      setNote('');
      onResolved();
    },
  });

  const serverError =
    resolve.error instanceof ApiClientError ? apiErrorMessage(m, resolve.error.code) : resolve.error ? apiErrorMessage(m) : null;

  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-2.5" data-testid={`resolve-issue-${issue.id}`}>
      <Label htmlFor={`resolve-note-${issue.id}`}>{w.resolutionNoteLabel}</Label>
      <Textarea
        id={`resolve-note-${issue.id}`}
        data-testid={`resolve-note-${issue.id}`}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (fieldError) setFieldError(null);
        }}
      />
      {fieldError && (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      )}
      {serverError && (
        <Notice tone="error" testId={`resolve-issue-${issue.id}-error`}>
          {serverError}
        </Notice>
      )}
      <Button
        type="button"
        size="sm"
        className="w-fit"
        data-testid={`resolve-issue-${issue.id}-submit`}
        disabled={resolve.isPending}
        onClick={() => {
          if (!note.trim()) {
            setFieldError(w.resolutionNoteRequired);
            return;
          }
          resolve.mutate({ resolutionNote: note.trim() });
        }}
      >
        {resolve.isPending ? w.resolveSubmitting : w.resolveSubmit}
      </Button>
    </div>
  );
}
