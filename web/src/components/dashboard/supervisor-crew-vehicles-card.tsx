'use client';

/**
 * frozen.10 (SUP-7/D5) — supervisor "on behalf of his drivers" dashboard card:
 * (1) crew vehicles + who's driving them, with a direct "Allot to…" action
 *     (`POST /vehicles/:id/assign-driver` — log-only, auto-approved, no
 *     request; the backend notifies the SM + both affected drivers) and
 * (2) a compact damage-report shortcut for a crew vehicle
 *     (`POST /records/issue` — the same endpoint the driver's own damage form
 *     uses; scope already allows supervisors via `record.enter`).
 *
 * `GET /vehicles` and `GET /users` are already server-scoped to the
 * supervisor's own crew/site (frozen.10 single-site + crew scope) — this card
 * never filters by site itself.
 *
 * All strings are module-local (this file predates + does not touch the
 * frozen i18n message catalogs).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { ISSUE_SEVERITIES } from '@techbuilder/contracts';
import type { AssignDriverInput, CreateIssueInput, Issue, IssueSeverity, User, UUID, Vehicle } from '@techbuilder/contracts';
import { uuidv7 } from 'uuidv7';
import { ApiClientError, api } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

const UI = {
  en: {
    vehiclesTitle: 'Crew vehicles',
    vehiclesSubtitle: 'Who is driving what, and re-allot on the spot',
    noVehicles: 'No vehicles for your crew yet',
    currentDriverPrefix: 'Driver:',
    noDriver: 'No driver assigned',
    allotTo: 'Allot to…',
    selectDriver: 'Select a driver',
    noDrivers: 'No drivers in your crew',
    confirm: 'Allot',
    allotting: 'Saving…',
    allotted: 'Allotted.',
    damageTitle: 'Report damage',
    damageSubtitle: 'Raise a damage report for a crew vehicle',
    vehicleLabel: 'Vehicle',
    severityLabel: 'Severity',
    descriptionLabel: 'What happened?',
    descriptionRequired: 'Describe the damage',
    submit: 'Submit',
    submitting: 'Saving…',
    saved: 'Damage report saved.',
    severityLow: 'Low',
    severityMedium: 'Medium',
    severityHigh: 'High',
  },
  hi: {
    vehiclesTitle: 'क्रू के वाहन',
    vehiclesSubtitle: 'कौन कौन सी गाड़ी चला रहा है — यहीं से बदलें',
    noVehicles: 'आपके क्रू के लिए अभी कोई वाहन नहीं',
    currentDriverPrefix: 'ड्राइवर:',
    noDriver: 'कोई ड्राइवर नहीं लगा',
    allotTo: 'किसे दें…',
    selectDriver: 'ड्राइवर चुनें',
    noDrivers: 'आपके क्रू में कोई ड्राइवर नहीं',
    confirm: 'दें',
    allotting: 'सहेजा जा रहा है…',
    allotted: 'दे दिया गया।',
    damageTitle: 'नुक़सान बताएँ',
    damageSubtitle: 'क्रू के किसी वाहन का नुक़सान दर्ज करें',
    vehicleLabel: 'वाहन',
    severityLabel: 'गंभीरता',
    descriptionLabel: 'क्या हुआ?',
    descriptionRequired: 'नुक़सान के बारे में बताएँ',
    submit: 'भेजें',
    submitting: 'सहेजा जा रहा है…',
    saved: 'नुक़सान की रिपोर्ट सहेज ली गई।',
    severityLow: 'कम',
    severityMedium: 'मध्यम',
    severityHigh: 'ज़्यादा',
  },
} as const;

type UiText = Record<keyof (typeof UI)['en'], string>;

const vehicleLabel = (v: Vehicle) => (v.name ? `${v.regNo} · ${v.name}` : v.regNo);

export function SupervisorCrewVehiclesCard() {
  const locale = useLocale();
  const ui = UI[locale];
  const qc = useQueryClient();

  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  const vehicles = vehiclesQ.data ?? [];
  const drivers = (usersQ.data ?? []).filter((u) => u.role === 'DRIVER' && u.personId);
  const driverName = (personId: UUID | null) => drivers.find((d) => d.personId === personId)?.name ?? null;

  const invalidateVehicles = () => void qc.invalidateQueries({ queryKey: ['vehicles'] });

  return (
    <div className="grid gap-4">
      <Card data-testid="supervisor-crew-vehicles-card">
        <CardHeader>
          <CardTitle>{ui.vehiclesTitle}</CardTitle>
          <CardDescription>{ui.vehiclesSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {vehiclesQ.isPending || usersQ.isPending ? (
            <LoadingState />
          ) : vehiclesQ.error ? (
            <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
          ) : usersQ.error ? (
            <ErrorState error={usersQ.error} onRetry={() => void usersQ.refetch()} />
          ) : vehicles.length === 0 ? (
            <EmptyState label={ui.noVehicles} />
          ) : (
            <ul className="grid gap-3" data-testid="supervisor-crew-vehicles-list">
              {vehicles.map((v) => (
                <VehicleRow
                  key={v.id}
                  ui={ui}
                  vehicle={v}
                  drivers={drivers}
                  currentDriverName={driverName(v.assignedDriverPersonId)}
                  onAllotted={invalidateVehicles}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DamageReportCard ui={ui} vehicles={vehicles} vehiclesLoading={vehiclesQ.isPending} vehiclesError={vehiclesQ.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One vehicle row: current driver + "Allot to…" action
// ---------------------------------------------------------------------------

function VehicleRow({
  ui,
  vehicle,
  drivers,
  currentDriverName,
  onAllotted,
}: {
  ui: UiText;
  vehicle: Vehicle;
  drivers: User[];
  currentDriverName: string | null;
  onAllotted: () => void;
}) {
  const m = useMessages();
  const [pickedDriverPersonId, setPickedDriverPersonId] = useState<UUID | ''>('');
  const [done, setDone] = useState(false);

  const assign = useMutation({
    mutationFn: (input: AssignDriverInput) => api<Vehicle>('POST', `/vehicles/${vehicle.id}/assign-driver`, input),
    onSuccess: () => {
      setDone(true);
      setPickedDriverPersonId('');
      onAllotted();
    },
    onError: () => setDone(false),
  });

  const serverError =
    assign.error instanceof ApiClientError ? apiErrorMessage(m, assign.error.code) : assign.error ? apiErrorMessage(m) : null;

  return (
    <li className="grid gap-2 rounded-lg border border-input p-2.5" data-testid={`supervisor-crew-vehicle-${vehicle.id}`}>
      <div className="flex items-center gap-2">
        <Truck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{vehicleLabel(vehicle)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ui.currentDriverPrefix} {currentDriverName ?? ui.noDriver}
          </p>
        </div>
      </div>

      {drivers.length > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <NativeSelect
            aria-label={ui.allotTo}
            data-testid={`supervisor-crew-vehicle-allot-select-${vehicle.id}`}
            value={pickedDriverPersonId}
            onChange={(e) => {
              setPickedDriverPersonId(e.target.value);
              setDone(false);
            }}
          >
            <option value="">{ui.selectDriver}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.personId ?? ''}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            data-testid={`supervisor-crew-vehicle-allot-confirm-${vehicle.id}`}
            disabled={!pickedDriverPersonId || assign.isPending}
            onClick={() => pickedDriverPersonId && assign.mutate({ driverPersonId: pickedDriverPersonId })}
          >
            {assign.isPending ? ui.allotting : ui.confirm}
          </Button>
        </div>
      )}

      {serverError && (
        <Notice tone="error" testId={`supervisor-crew-vehicle-error-${vehicle.id}`}>
          {serverError}
        </Notice>
      )}
      {done && (
        <Notice tone="success" testId={`supervisor-crew-vehicle-done-${vehicle.id}`}>
          {ui.allotted}
        </Notice>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Compact damage-report shortcut
// ---------------------------------------------------------------------------

function DamageReportCard({
  ui,
  vehicles,
  vehiclesLoading,
  vehiclesError,
}: {
  ui: UiText;
  vehicles: Vehicle[];
  vehiclesLoading: boolean;
  vehiclesError: unknown;
}) {
  const m = useMessages();
  const [vehicleId, setVehicleId] = useState<UUID | ''>('');
  const [severity, setSeverity] = useState<IssueSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const severityLabel = (s: IssueSeverity): string =>
    s === 'LOW' ? ui.severityLow : s === 'MEDIUM' ? ui.severityMedium : ui.severityHigh;

  const effectiveVehicleId = vehicleId !== '' ? vehicleId : (vehicles[0]?.id ?? '');

  const submit = useMutation({
    mutationFn: (input: CreateIssueInput) => api<Issue>('POST', '/records/issue', input),
    onSuccess: () => {
      setSaved(true);
      setDescription('');
      setSeverity('LOW');
    },
    onError: () => setSaved(false),
  });

  const serverError =
    submit.error instanceof ApiClientError ? apiErrorMessage(m, submit.error.code) : submit.error ? apiErrorMessage(m) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!description.trim()) {
      setDescriptionError(ui.descriptionRequired);
      return;
    }
    if (!effectiveVehicleId) return;
    setDescriptionError(null);
    submit.mutate({
      id: uuidv7(),
      vehicleId: effectiveVehicleId,
      severity,
      description: description.trim(),
      businessDate: todayKolkata(),
    });
  };

  return (
    <Card data-testid="supervisor-damage-card">
      <CardHeader>
        <CardTitle>{ui.damageTitle}</CardTitle>
        <CardDescription>{ui.damageSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {vehiclesLoading ? (
          <LoadingState />
        ) : vehiclesError ? (
          <ErrorState error={vehiclesError} />
        ) : vehicles.length === 0 ? (
          <EmptyState label={ui.noVehicles} />
        ) : (
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-vehicle">{ui.vehicleLabel}</Label>
              <NativeSelect
                id="supervisor-damage-vehicle"
                data-testid="supervisor-damage-vehicle"
                value={effectiveVehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-severity">{ui.severityLabel}</Label>
              <NativeSelect
                id="supervisor-damage-severity"
                data-testid="supervisor-damage-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              >
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {severityLabel(s)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-description">{ui.descriptionLabel}</Label>
              <Textarea
                id="supervisor-damage-description"
                data-testid="supervisor-damage-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descriptionError) setDescriptionError(null);
                }}
              />
              {descriptionError && (
                <p className="text-sm text-destructive" role="alert">
                  {descriptionError}
                </p>
              )}
            </div>

            {serverError && (
              <Notice tone="error" testId="supervisor-damage-error">
                {serverError}
              </Notice>
            )}
            {saved && (
              <Notice tone="success" testId="supervisor-damage-saved">
                {ui.saved}
              </Notice>
            )}

            <Button type="submit" data-testid="supervisor-damage-submit" disabled={submit.isPending || !effectiveVehicleId}>
              {submit.isPending ? ui.submitting : ui.submit}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
