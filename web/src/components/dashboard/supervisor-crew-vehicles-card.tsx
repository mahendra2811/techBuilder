'use client';

/**
 * frozen.10 (SUP-7/D5), SUPERVISOR restructure — crew vehicles + who's driving them,
 * with a direct "Allot to…" action (`POST /vehicles/:id/assign-driver` — log-only,
 * auto-approved, no request; the backend notifies the SM + both affected drivers).
 *
 * Moved OFF the dashboard onto its own page (/supervisor/vehicle) per client feedback —
 * the dashboard should only link out, not host full functionality. The damage-report
 * shortcut that used to sit below this card on the dashboard is now its own richer page
 * (see supervisor-damage-screen.tsx, /supervisor/damage — same inputs as the driver's
 * damage form: severity/description/photos/voice + a history timeline).
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
import type { AssignDriverInput, User, UUID, Vehicle } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
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
