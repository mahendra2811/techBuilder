'use client';

/**
 * Driver dashboard (/driver) — the driver's day (reworked per
 * docs/role-page-map/driver/driver-role-updates.md DRV-1/DRV-5, frozen.10):
 *   1. Vehicle snapshot card — GET /vehicles/my-snapshot (own assigned vehicle,
 *      identity + status only — the current/yesterday reading readout is GONE
 *      per client feedback). Instead: THREE traffic-light day-log status chips
 *      (yesterday night / today morning / today evening), derived from today's
 *      + yesterday's GET /records/vehicle-log rows. Tapping a YELLOW
 *      (actionable) chip scrolls to the matching form below; green/red chips
 *      are display-only (a missed day-log is informational — no back-fill).
 *      Also keeps the pending vehicle-switch chip.
 *   2. Morning "start of day" form (compulsory) — shown until a vehicle_log
 *      row exists for today. "Today's log" is sourced from the existing
 *      generic GET /records/vehicle-log?from&to list endpoint (vehicle-scoped
 *      server-side, same pattern the old screen already used for fuel), NOT a
 *      new field on the snapshot contract (frozen — not touched here).
 *   3. Evening "end of day" form (optional) — shown once the morning log
 *      exists; re-POSTs the SAME record id/businessDate, which the backend
 *      upserts (version bump).
 * Recent fuel entries moved to the new /driver/fuel page (D3) — this screen no
 * longer fetches /records/fuel at all.
 * NEVER calls /dashboards/owner or /completeness — those are OWNER + SITE_MANAGER
 * only (backend throws FORBIDDEN for DRIVER).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import type { CreateVehicleLogInput, UUID, VehicleLog, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhoto, uploadPhotos } from '@/lib/media-upload';
import { apiErrorMessage, type Messages } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ContactPanel } from '@/components/contact-panel';
import { KhataCard } from '@/components/khata-card';
import { PhotoField } from '@/components/entry/photo-field';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { RequestStatusBadge } from '@/components/requests/request-bits';

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
  },
  hi: {
    yesterdayNight: 'कल रात',
    todayMorning: 'आज सुबह',
    todayEvening: 'आज शाम',
    filled: 'भरा गया',
    pending: 'बाकी है',
    missed: 'छूट गया',
  },
} as const;

type DayLogTone = 'success' | 'warning' | 'warningMuted' | 'error';

const DAY_LOG_TONE_CLASSES: Record<DayLogTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  warningMuted: 'border-input bg-muted/40 text-muted-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const DAY_LOG_DOT_CLASSES: Record<DayLogTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  warningMuted: 'bg-amber-500/40',
  error: 'bg-destructive',
};

/** One traffic-light day-log chip. Only wired with `onClick` when it's an
 * actionable (bright) yellow — green/red/muted-yellow chips are display-only. */
function DayLogChip({
  label,
  tone,
  statusLabel,
  onClick,
  testId,
}: {
  label: string;
  tone: DayLogTone;
  statusLabel: string;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'grid gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
        DAY_LOG_TONE_CLASSES[tone],
        onClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium leading-tight">
        <span className={cn('size-1.5 shrink-0 rounded-full', DAY_LOG_DOT_CLASSES[tone])} aria-hidden="true" />
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
    </button>
  );
}

export function DriverDashboardScreen() {
  const m = useMessages();
  const locale = useLocale();
  const dayLogUi = DAY_LOG_UI[locale];
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [morningPhotoWarning, setMorningPhotoWarning] = useState(false);
  const morningFormRef = useRef<HTMLDivElement>(null);
  const eveningFormRef = useRef<HTMLDivElement>(null);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const driverPersonId = meQ.data?.user.personId ?? null;

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

  // Two dedicated callbacks (not a ref-taking helper called during render) — each
  // reads `.current` only when actually invoked, from an event handler.
  const scrollToMorningForm = useCallback(() => {
    morningFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const scrollToEveningForm = useCallback(() => {
    eveningFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const invalidateDay = () => {
    void queryClient.invalidateQueries({ queryKey: ['records', 'vehicle-log', today] });
    void queryClient.invalidateQueries({ queryKey: ['records', 'vehicle-log', yesterday] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles', 'my-snapshot'] });
  };

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
                    testId="daylog-yesterday-night"
                  />
                  <DayLogChip
                    label={dayLogUi.todayMorning}
                    tone={todayMorningTone}
                    statusLabel={dayLogStatusLabel(todayMorningTone)}
                    onClick={todayMorningTone === 'warning' ? scrollToMorningForm : undefined}
                    testId="daylog-today-morning"
                  />
                  <DayLogChip
                    label={dayLogUi.todayEvening}
                    tone={todayEveningTone}
                    statusLabel={dayLogStatusLabel(todayEveningTone)}
                    onClick={todayEveningTone === 'warning' ? scrollToEveningForm : undefined}
                    testId="daylog-today-evening"
                  />
                </div>

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

      {vehicle && driverPersonId && (
        <>
          {todayLogQ.isPending ? (
            <Card>
              <CardContent className="pt-6">
                <LoadingState />
              </CardContent>
            </Card>
          ) : todayLogQ.error ? (
            <Card>
              <CardContent className="pt-6">
                <ErrorState error={todayLogQ.error} onRetry={() => void todayLogQ.refetch()} />
              </CardContent>
            </Card>
          ) : !todayLog ? (
            <div ref={morningFormRef}>
              <MorningForm
                vehicleId={vehicle.id}
                driverPersonId={driverPersonId}
                today={today}
                onSaved={(photoFailed) => {
                  setMorningPhotoWarning(photoFailed);
                  invalidateDay();
                }}
              />
            </div>
          ) : (
            <div ref={eveningFormRef} className="grid gap-4">
              {morningPhotoWarning && (
                <Notice tone="warning" testId="morning-photo-warning-persisted">
                  {m.ENTRY_UI.photoNotUploaded}
                </Notice>
              )}
              <EveningForm
                key={`${todayLog.id}-${todayLog.version}`}
                vehicleId={vehicle.id}
                driverPersonId={driverPersonId}
                today={today}
                todayLog={todayLog}
                onSaved={invalidateDay}
              />
            </div>
          )}
        </>
      )}

      <ContactPanel />
    </div>
  );
}

// ---- Morning (start-of-day) form ----

const makeMorningFormSchema = (e: Messages['DRIVER_DAY_UI']) =>
  z.object({
    startReading: z
      .string()
      .min(1, e.startReadingRequired)
      .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, e.startReadingRequired),
  });
type MorningFormValues = z.infer<ReturnType<typeof makeMorningFormSchema>>;

function MorningForm({
  vehicleId,
  driverPersonId,
  today,
  onSaved,
}: {
  vehicleId: UUID;
  driverPersonId: UUID;
  today: string;
  onSaved: (photoFailed: boolean) => void;
}) {
  const m = useMessages();
  const [meterPhoto, setMeterPhoto] = useState<File | null>(null);
  const [meterPhotoError, setMeterPhotoError] = useState(false);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MorningFormValues>({
    resolver: zodResolver(useMemo(() => makeMorningFormSchema(m.DRIVER_DAY_UI), [m])),
    defaultValues: { startReading: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: MorningFormValues) => {
      const id = uuidv7();
      let photoFailed = false;
      const meterMediaId = await uploadPhoto(meterPhoto as File, { kind: 'PHOTO', parentType: 'vehicle_log', parentId: id });
      if (!meterMediaId) photoFailed = true;
      if (extraPhotos.length) {
        const uploaded = await uploadPhotos(extraPhotos, { kind: 'PHOTO', parentType: 'vehicle_log', parentId: id });
        if (uploaded.length < extraPhotos.length) photoFailed = true;
      }
      const input: CreateVehicleLogInput = {
        id,
        vehicleId,
        driverPersonId,
        startReading: Number(values.startReading),
        businessDate: today,
      };
      await api<VehicleLog>('POST', '/records/vehicle-log', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => onSaved(photoFailed),
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.DRIVER_DAY_UI.morningTitle}</CardTitle>
        <CardDescription>{m.DRIVER_DAY_UI.morningSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Notice tone="warning" testId="morning-banner">
          {m.DRIVER_DAY_UI.morningBanner}
        </Notice>

        <form
          className="grid gap-4"
          noValidate
          onSubmit={handleSubmit((values) => {
            if (!meterPhoto) {
              setMeterPhotoError(true);
              return;
            }
            setMeterPhotoError(false);
            mutation.mutate(values);
          })}
        >
          <div className="grid gap-2">
            <PhotoField
              file={meterPhoto}
              onChange={(f) => {
                setMeterPhoto(f);
                if (f) setMeterPhotoError(false);
              }}
              testId="morning-meter-photo"
              label={m.DRIVER_DAY_UI.meterPhotoLabel}
            />
            {meterPhotoError && (
              <p className="text-sm text-destructive" role="alert">
                {m.DRIVER_DAY_UI.meterPhotoRequired}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="morning-start-reading">{m.DRIVER_DAY_UI.startReadingLabel}</Label>
            <Input
              id="morning-start-reading"
              type="number"
              inputMode="numeric"
              min={0}
              data-testid="morning-start-reading"
              {...register('startReading')}
            />
            {errors.startReading && (
              <p className="text-sm text-destructive" role="alert">
                {errors.startReading.message}
              </p>
            )}
          </div>

          <PhotoMultiField
            files={extraPhotos}
            onChange={setExtraPhotos}
            max={3}
            label={m.DRIVER_DAY_UI.extraPhotosLabel}
            testId="morning-extra-photos"
          />

          {serverError && (
            <Notice tone="error" testId="morning-error">
              {serverError}
            </Notice>
          )}

          <Button type="submit" data-testid="morning-submit" disabled={mutation.isPending}>
            {mutation.isPending ? m.ENTRY_UI.saving : m.DRIVER_DAY_UI.morningSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Evening (end-of-day) form — optional ----

const makeEveningFormSchema = (e: Messages['DRIVER_DAY_UI'], minStart: number) =>
  z.object({
    endReading: z
      .string()
      .min(1, e.endReadingRequired)
      .refine((v) => Number.isFinite(Number(v)), e.endReadingRequired)
      .refine((v) => Number(v) >= minStart, e.endReadingTooLow),
    hoursWorked: z
      .string()
      .optional()
      .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), e.hoursWorkedInvalid),
    loadsCount: z
      .string()
      .optional()
      .refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0), e.loadsCountInvalid),
    note: z.string().optional(),
  });
type EveningFormValues = z.infer<ReturnType<typeof makeEveningFormSchema>>;

function EveningForm({
  vehicleId,
  driverPersonId,
  today,
  todayLog,
  onSaved,
}: {
  vehicleId: UUID;
  driverPersonId: UUID;
  today: string;
  todayLog: VehicleLog;
  onSaved: () => void;
}) {
  const m = useMessages();
  const [meterPhoto, setMeterPhoto] = useState<File | null>(null);
  const [meterPhotoError, setMeterPhotoError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EveningFormValues>({
    resolver: zodResolver(useMemo(() => makeEveningFormSchema(m.DRIVER_DAY_UI, todayLog.startReading), [m, todayLog.startReading])),
    defaultValues: {
      endReading: todayLog.endReading != null ? String(todayLog.endReading) : '',
      hoursWorked: todayLog.hoursWorked != null ? String(todayLog.hoursWorked) : '',
      loadsCount: todayLog.loadsCount != null ? String(todayLog.loadsCount) : '',
      note: todayLog.note ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: EveningFormValues) => {
      let photoFailed = false;
      const meterMediaId = await uploadPhoto(meterPhoto as File, {
        kind: 'PHOTO',
        parentType: 'vehicle_log',
        parentId: todayLog.id,
      });
      if (!meterMediaId) photoFailed = true;
      const input: CreateVehicleLogInput = {
        id: todayLog.id,
        vehicleId,
        driverPersonId,
        startReading: todayLog.startReading,
        endReading: Number(values.endReading),
        hoursWorked: values.hoursWorked?.trim() ? Number(values.hoursWorked) : undefined,
        loadsCount: values.loadsCount?.trim() ? Number(values.loadsCount) : undefined,
        note: values.note?.trim() ? values.note.trim() : undefined,
        businessDate: today,
      };
      await api<VehicleLog>('POST', '/records/vehicle-log', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => {
      setSaved(true);
      setPhotoWarning(photoFailed);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.DRIVER_DAY_UI.eveningTitle}</CardTitle>
        <CardDescription>{m.DRIVER_DAY_UI.eveningSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={handleSubmit((values) => {
            if (!meterPhoto) {
              setMeterPhotoError(true);
              return;
            }
            setMeterPhotoError(false);
            setSaved(false);
            mutation.mutate(values);
          })}
        >
          <div className="grid gap-2">
            <PhotoField
              file={meterPhoto}
              onChange={(f) => {
                setMeterPhoto(f);
                if (f) setMeterPhotoError(false);
              }}
              testId="evening-meter-photo"
              label={m.DRIVER_DAY_UI.meterPhotoLabel}
            />
            {meterPhotoError && (
              <p className="text-sm text-destructive" role="alert">
                {m.DRIVER_DAY_UI.meterPhotoRequired}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="evening-end-reading">{m.DRIVER_DAY_UI.currentReadingLabel}</Label>
            <Input
              id="evening-end-reading"
              type="number"
              inputMode="numeric"
              min={0}
              data-testid="evening-end-reading"
              {...register('endReading')}
            />
            {errors.endReading && (
              <p className="text-sm text-destructive" role="alert">
                {errors.endReading.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="evening-hours-worked">{m.DRIVER_DAY_UI.hoursWorkedLabel}</Label>
              <Input
                id="evening-hours-worked"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                data-testid="evening-hours-worked"
                {...register('hoursWorked')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evening-loads-count">{m.DRIVER_DAY_UI.loadsCountLabel}</Label>
              <Input
                id="evening-loads-count"
                type="number"
                inputMode="numeric"
                min={0}
                data-testid="evening-loads-count"
                {...register('loadsCount')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{m.DRIVER_DAY_UI.hoursWorkedHint}</p>
          {(errors.hoursWorked || errors.loadsCount) && (
            <p className="text-sm text-destructive" role="alert">
              {errors.hoursWorked?.message ?? errors.loadsCount?.message}
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="evening-note">{m.DRIVER_DAY_UI.noteLabel}</Label>
            <Textarea id="evening-note" data-testid="evening-note" {...register('note')} />
          </div>

          {serverError && (
            <Notice tone="error" testId="evening-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="evening-saved">
              {m.DRIVER_DAY_UI.eveningSaved}
            </Notice>
          )}
          {photoWarning && (
            <Notice tone="warning" testId="evening-photo-warning">
              {m.ENTRY_UI.photoNotUploaded}
            </Notice>
          )}

          <Button type="submit" data-testid="evening-submit" disabled={mutation.isPending}>
            {mutation.isPending ? m.ENTRY_UI.saving : m.DRIVER_DAY_UI.eveningSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
