'use client';

/**
 * Fleet management (Owner + SM — one component, two thin wrappers).
 *   (a) the scoped vehicle list (GET /vehicles — Owner: org-wide, SM: own site),
 *       with type/site/driver names resolved client-side from the sibling lists,
 *   (b) an "add vehicle" form (site placement mirrors the backend scope rule:
 *       an SM must place a new vehicle on one of their own sites; the Owner may
 *       place it anywhere or leave it unassigned),
 *   (c) a small vehicle-type list + "add vehicle type" form — both roles hold
 *       `vehicle.manage`, so both may add a type (keeps the picker self-serve;
 *       no separate admin-only screen needed for this small a form).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Truck } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { VEHICLE_STATUSES, VEHICLE_TRACKING_MODES } from '@techbuilder/contracts';
import type {
  CreateVehicleInput,
  CreateVehicleTypeInput,
  Person,
  Site,
  UUID,
  Vehicle,
  VehicleStatus,
  VehicleTrackingMode,
  VehicleType,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

type FleetRole = 'OWNER' | 'SITE_MANAGER';

export function FleetScreen({ role }: { role: FleetRole }) {
  const m = useMessages();
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const vehicleTypesQ = useQuery({ queryKey: ['vehicle-types'], queryFn: () => api<VehicleType[]>('GET', '/vehicle-types') });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  return (
    <div className="grid gap-4" data-testid="fleet-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.FLEET_UI.title}</CardTitle>
          <CardDescription>{m.FLEET_UI.subtitle}</CardDescription>
        </CardHeader>
      </Card>

      <VehicleList
        role={role}
        vehiclesQ={vehiclesQ}
        vehicleTypes={vehicleTypesQ.data ?? []}
        sites={sitesQ.data ?? []}
        people={peopleQ.data ?? []}
      />

      <CreateVehicleForm
        role={role}
        vehicleTypes={vehicleTypesQ.data}
        vehicleTypesLoading={vehicleTypesQ.isPending}
        sites={sitesQ.data}
        sitesLoading={sitesQ.isPending}
        people={peopleQ.data ?? []}
      />

      <VehicleTypeList vehicleTypesQ={vehicleTypesQ} />

      <CreateVehicleTypeForm />
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) Vehicle list
// ---------------------------------------------------------------------------

function VehicleList({
  role,
  vehiclesQ,
  vehicleTypes,
  sites,
  people,
}: {
  role: FleetRole;
  vehiclesQ: ReturnType<typeof useQuery<Vehicle[]>>;
  vehicleTypes: VehicleType[];
  sites: Site[];
  people: Person[];
}) {
  const m = useMessages();
  const basePath = role === 'OWNER' ? '/owner/fleet' : '/site-manager/fleet';
  const typeName = (id: UUID) => vehicleTypes.find((t) => t.id === id)?.name;
  const trackingMode = (id: UUID) => vehicleTypes.find((t) => t.id === id)?.trackingMode;
  const siteName = (id: UUID | null) => (id ? sites.find((s) => s.id === id)?.name : undefined);
  const driverName = (id: UUID | null) => (id ? people.find((p) => p.id === id)?.name : undefined);

  return (
    <Card data-testid="vehicle-list">
      <CardHeader>
        <CardTitle>{m.FLEET_UI.listTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {vehiclesQ.isPending ? (
          <LoadingState />
        ) : vehiclesQ.error ? (
          <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
        ) : !vehiclesQ.data || vehiclesQ.data.length === 0 ? (
          <EmptyState label={m.FLEET_UI.listEmpty} />
        ) : (
          <ul className="divide-y">
            {vehiclesQ.data.map((v) => (
              <li key={v.id}>
                <Link
                  href={`${basePath}/${v.id}`}
                  data-testid={`vehicle-row-${v.id}`}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {v.regNo}
                        {v.name && <span className="ml-1.5 font-normal text-muted-foreground">· {v.name}</span>}
                      </p>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {m.VEHICLE_STATUS_LABELS[v.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {typeName(v.vehicleTypeId) ?? '—'}
                      {trackingMode(v.vehicleTypeId) &&
                        ` (${m.VEHICLE_TRACKING_MODE_LABELS[trackingMode(v.vehicleTypeId)!]})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.FLEET_UI.assignedSite}: {siteName(v.assignedSiteId) ?? m.FLEET_UI.noSite}
                      {' · '}
                      {m.FLEET_UI.assignedDriver}: {driverName(v.assignedDriverPersonId) ?? m.FLEET_UI.noDriver}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (b) Add vehicle
// ---------------------------------------------------------------------------

function CreateVehicleForm({
  role,
  vehicleTypes,
  vehicleTypesLoading,
  sites,
  sitesLoading,
  people,
}: {
  role: FleetRole;
  vehicleTypes: VehicleType[] | undefined;
  vehicleTypesLoading: boolean;
  sites: Site[] | undefined;
  sitesLoading: boolean;
  people: Person[];
}) {
  const m = useMessages();
  const queryClient = useQueryClient();

  const [vehicleTypeId, setVehicleTypeId] = useState<UUID | ''>('');
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [assignedSiteId, setAssignedSiteId] = useState<UUID | ''>('');
  const [assignedDriverPersonId, setAssignedDriverPersonId] = useState<UUID | ''>('');
  const [status, setStatus] = useState<VehicleStatus>('IDLE');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const siteRequired = role === 'SITE_MANAGER';
  // Drivers are the labour-master rows with skill DRIVER — the sensible subset
  // to offer here (any person could technically be picked, but the domain
  // intent of "driver" maps to that skill in the seed data + backend model).
  const drivers = people.filter((p) => p.skill === 'DRIVER');

  const create = useMutation({
    mutationFn: (input: CreateVehicleInput) => api<Vehicle>('POST', '/vehicles', input),
    onSuccess: () => {
      setSaved(true);
      setRegNo('');
      setName('');
      setAssignedSiteId('');
      setAssignedDriverPersonId('');
      setStatus('IDLE');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const errs: Record<string, string> = {};
    if (!regNo.trim()) errs.regNo = m.FLEET_UI.regNoRequired;
    if (!vehicleTypeId) errs.type = m.FLEET_UI.typeRequired;
    if (siteRequired && !assignedSiteId) errs.site = m.FLEET_UI.siteRequired;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const input: CreateVehicleInput = {
      id: uuidv7(),
      vehicleTypeId: vehicleTypeId as UUID,
      regNo: regNo.trim(),
      status,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(assignedSiteId ? { assignedSiteId } : {}),
      ...(assignedDriverPersonId ? { assignedDriverPersonId } : {}),
    };
    create.mutate(input);
  };

  const dupRegNo =
    create.error instanceof ApiClientError && (create.error.code === 'DUPLICATE' || create.error.fields?.regNo);
  const serverError =
    !dupRegNo && create.error instanceof ApiClientError
      ? apiErrorMessage(m, create.error.code)
      : !dupRegNo && create.error
        ? apiErrorMessage(m)
        : null;

  return (
    <Card data-testid="create-vehicle">
      <CardHeader>
        <CardTitle>{m.FLEET_UI.addVehicleTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="vehicle-regno">{m.FLEET_UI.regNo}</Label>
            <Input id="vehicle-regno" data-testid="vehicle-regno" value={regNo} onChange={(e) => setRegNo(e.target.value)} />
            {errors.regNo && (
              <p className="text-sm text-destructive" role="alert">
                {errors.regNo}
              </p>
            )}
            {dupRegNo && (
              <p className="text-sm text-destructive" role="alert" data-testid="vehicle-regno-taken">
                {m.FLEET_UI.regNoTaken}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle-name">{m.FLEET_UI.name}</Label>
            <Input id="vehicle-name" data-testid="vehicle-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle-type">{m.FLEET_UI.type}</Label>
            {vehicleTypesLoading ? (
              <LoadingState />
            ) : !vehicleTypes || vehicleTypes.length === 0 ? (
              <Notice tone="warning" testId="vehicle-no-types">
                {m.FLEET_UI.noTypes}
              </Notice>
            ) : (
              <NativeSelect
                id="vehicle-type"
                data-testid="vehicle-type"
                value={vehicleTypeId}
                onChange={(e) => setVehicleTypeId(e.target.value)}
              >
                <option value="">{m.FLEET_UI.selectType}</option>
                {vehicleTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({m.VEHICLE_TRACKING_MODE_LABELS[t.trackingMode]})
                  </option>
                ))}
              </NativeSelect>
            )}
            {errors.type && (
              <p className="text-sm text-destructive" role="alert">
                {errors.type}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle-site">{m.FLEET_UI.site}</Label>
            {sitesLoading ? (
              <LoadingState />
            ) : (
              <NativeSelect
                id="vehicle-site"
                data-testid="vehicle-site"
                value={assignedSiteId}
                onChange={(e) => setAssignedSiteId(e.target.value)}
              >
                <option value="">{siteRequired ? m.FLEET_UI.selectSite : m.FLEET_UI.noSite}</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </NativeSelect>
            )}
            {errors.site && (
              <p className="text-sm text-destructive" role="alert">
                {errors.site}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle-driver">{m.FLEET_UI.driver}</Label>
            <NativeSelect
              id="vehicle-driver"
              data-testid="vehicle-driver"
              value={assignedDriverPersonId}
              onChange={(e) => setAssignedDriverPersonId(e.target.value)}
            >
              <option value="">{m.FLEET_UI.noDriver}</option>
              {drivers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vehicle-status">{m.FLEET_UI.status}</Label>
            <NativeSelect
              id="vehicle-status"
              data-testid="vehicle-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as VehicleStatus)}
            >
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {m.VEHICLE_STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {serverError && (
            <Notice tone="error" testId="create-vehicle-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-vehicle-success">
              {m.FLEET_UI.vehicleAdded}
            </Notice>
          )}

          <Button type="submit" data-testid="create-vehicle-submit" disabled={create.isPending}>
            <Truck className="size-4" aria-hidden="true" />
            {create.isPending ? m.FLEET_UI.addingVehicle : m.FLEET_UI.addVehicleSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (c) Vehicle types
// ---------------------------------------------------------------------------

function VehicleTypeList({ vehicleTypesQ }: { vehicleTypesQ: ReturnType<typeof useQuery<VehicleType[]>> }) {
  const m = useMessages();
  return (
    <Card size="sm" data-testid="vehicle-type-list">
      <CardHeader>
        <CardTitle>{m.FLEET_UI.typesTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {vehicleTypesQ.isPending ? (
          <LoadingState />
        ) : vehicleTypesQ.error ? (
          <ErrorState error={vehicleTypesQ.error} onRetry={() => void vehicleTypesQ.refetch()} />
        ) : !vehicleTypesQ.data || vehicleTypesQ.data.length === 0 ? (
          <EmptyState label={m.FLEET_UI.typesEmpty} />
        ) : (
          <ul className="divide-y">
            {vehicleTypesQ.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0" data-testid={`vehicle-type-row-${t.id}`}>
                <span className="text-sm font-medium">{t.name}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {m.VEHICLE_TRACKING_MODE_LABELS[t.trackingMode]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreateVehicleTypeForm() {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [trackingMode, setTrackingMode] = useState<VehicleTrackingMode>('KM');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateVehicleTypeInput) => api<VehicleType>('POST', '/vehicle-types', input),
    onSuccess: () => {
      setSaved(true);
      setName('');
      setTrackingMode('KM');
      void queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) {
      setNameError(m.FLEET_UI.typeNameRequired);
      return;
    }
    setNameError(null);
    create.mutate({ id: uuidv7(), name: name.trim(), trackingMode, fieldsSchema: [] });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card size="sm" data-testid="create-vehicle-type">
      <CardHeader>
        <CardTitle>{m.FLEET_UI.addTypeTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vehicle-type-name">{m.FLEET_UI.typeName}</Label>
              <Input id="vehicle-type-name" data-testid="vehicle-type-name" value={name} onChange={(e) => setName(e.target.value)} />
              {nameError && (
                <p className="text-sm text-destructive" role="alert">
                  {nameError}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vehicle-type-tracking">{m.FLEET_UI.trackingMode}</Label>
              <NativeSelect
                id="vehicle-type-tracking"
                data-testid="vehicle-type-tracking"
                value={trackingMode}
                onChange={(e) => setTrackingMode(e.target.value as VehicleTrackingMode)}
              >
                {VEHICLE_TRACKING_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {m.VEHICLE_TRACKING_MODE_LABELS[mode]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {serverError && (
            <Notice tone="error" testId="create-vehicle-type-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-vehicle-type-success">
              {m.FLEET_UI.typeAdded}
            </Notice>
          )}

          <Button type="submit" data-testid="create-vehicle-type-submit" disabled={create.isPending}>
            {create.isPending ? m.FLEET_UI.addingType : m.FLEET_UI.addTypeSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
