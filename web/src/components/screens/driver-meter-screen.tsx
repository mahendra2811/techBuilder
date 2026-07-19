'use client';

/**
 * Driver meter page (/driver/meter) — docs/role-page-map/driver/
 * driver-role-updates.md DRV-1/DRV-5 (frozen.10), Q1 resolved: the Morning
 * "start of day" + Evening "end of day" forms used to render inline on
 * /driver — reachable only by tapping a yellow day-log chip that scrolled the
 * page. They now live on this dedicated page instead; the dashboard's vehicle
 * card keeps just the compact 3-chip status strip and links here.
 *
 * This is a MOVE, not a rewrite: MorningForm/EveningForm below are the exact
 * components that used to live in driver-dashboard-screen.tsx — same fields,
 * validation, meter-photo requirement, submit endpoint (POST
 * /records/vehicle-log, upserted by id for the evening re-save), and
 * `invalidateDay()` cache invalidation. The only new behavior is layout:
 *   - Two always-visible sections, "Start of day" and "End of day".
 *   - Each section header shows a green check + "Filled" badge once that
 *     day's data exists (morning = today's vehicle_log row exists; evening =
 *     that row's endReading is set) — `EveningForm` grew one small `filled`
 *     prop for this (it still renders/stays editable once filled, same as
 *     before — the upsert behavior didn't change).
 *   - A small informational "yesterday night" chip up top, reusing the same
 *     data this page already fetches for the morning/evening sections (no
 *     extra request) — display-only, same as the dashboard's copy of it.
 */
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Truck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import type { CreateVehicleLogInput, UUID, VehicleLog, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhoto, uploadPhotos } from '@/lib/media-upload';
import { apiErrorOf, type Messages } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhotoField } from '@/components/entry/photo-field';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DayLogChip, type DayLogTone } from '@/components/vehicle/day-log-chip';

/** Module-local bilingual strings (repo convention: messages catalogs are for
 * NAV_LABELS only — screen copy stays local, mirrors DAY_LOG_UI in
 * driver-dashboard-screen.tsx). */
const METER_UI = {
  en: {
    yesterdayNight: 'Yesterday night',
    filled: 'Filled',
    pending: 'Pending',
    missed: 'Missed',
    filledBadge: 'Filled',
    fillMorningFirst: 'Fill "Start of day" first — then end of day opens up here.',
  },
  hi: {
    yesterdayNight: 'कल रात',
    filled: 'भरा गया',
    pending: 'बाकी है',
    missed: 'छूट गया',
    filledBadge: 'भरा गया',
    fillMorningFirst: 'पहले "दिन की शुरुआत" भरें — फिर यहाँ "दिन का अंत" खुलेगा।',
  },
} as const;

export function DriverMeterScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = METER_UI[locale];
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [morningPhotoWarning, setMorningPhotoWarning] = useState(false);

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

  // Yesterday's log — only needed for the informational "yesterday night" chip
  // up top (whether that day's evening entry was ever closed out); this page
  // has no back-fill form for it, same as the dashboard's chip.
  const yesterdayLogQ = useQuery({
    queryKey: ['records', 'vehicle-log', yesterday],
    queryFn: () => {
      const qs = new URLSearchParams({ from: yesterday, to: yesterday });
      return api<VehicleLog[]>('GET', `/records/vehicle-log?${qs}`);
    },
    enabled: !!vehicle,
  });
  const yesterdayLog = yesterdayLogQ.data?.[0] ?? null;

  const dayLogsUnready = yesterdayLogQ.isPending || !!yesterdayLogQ.error;
  const yesterdayNightTone: DayLogTone = dayLogsUnready
    ? 'warningMuted'
    : yesterdayLog?.endReading != null
      ? 'success'
      : 'error'; // window has passed — missed entries are informational only, no back-fill
  const yesterdayNightStatusLabel =
    yesterdayNightTone === 'success' ? ui.filled : yesterdayNightTone === 'error' ? ui.missed : ui.pending;

  const invalidateDay = () => {
    void queryClient.invalidateQueries({ queryKey: ['records', 'vehicle-log', today] });
    void queryClient.invalidateQueries({ queryKey: ['records', 'vehicle-log', yesterday] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles', 'my-snapshot'] });
  };

  return (
    <div className="grid gap-4" data-testid="driver-meter-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.DASH_UI.driverVehicleTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-16 content-start gap-3">
          {snapshotQ.isPending ? (
            <LoadingState />
          ) : noVehicle ? (
            <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
          ) : snapshotQ.error ? (
            <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
          ) : (
            vehicle && (
              <div className="grid gap-2">
                <div className="flex items-center gap-3 rounded-lg border border-input bg-muted/40 px-3 py-2.5">
                  <Truck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{vehicle.regNo}</p>
                    {vehicle.name && <p className="truncate text-xs text-muted-foreground">{vehicle.name}</p>}
                  </div>
                </div>
                <DayLogChip
                  label={ui.yesterdayNight}
                  tone={yesterdayNightTone}
                  statusLabel={yesterdayNightStatusLabel}
                  testId="meter-yesterday-night"
                />
              </div>
            )
          )}
        </CardContent>
      </Card>

      {vehicle && driverPersonId && (
        <>
          <div data-testid="meter-morning-section">
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
            ) : todayLog ? (
              <Card>
                <CardHeader>
                  <CardTitle>{m.DRIVER_DAY_UI.morningTitle}</CardTitle>
                  <CardAction>
                    <span
                      data-testid="meter-filled-badge-morning"
                      className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                    >
                      <Check className="size-4" aria-hidden="true" />
                      {ui.filledBadge}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {m.DRIVER_DAY_UI.startReadingLabel}: {todayLog.startReading}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <MorningForm
                vehicleId={vehicle.id}
                driverPersonId={driverPersonId}
                today={today}
                onSaved={(photoFailed) => {
                  setMorningPhotoWarning(photoFailed);
                  invalidateDay();
                }}
              />
            )}
          </div>

          <div data-testid="meter-evening-section" className="grid gap-2">
            {todayLogQ.isPending ? null : todayLogQ.error ? null : !todayLog ? (
              <Card>
                <CardHeader>
                  <CardTitle>{m.DRIVER_DAY_UI.eveningTitle}</CardTitle>
                  <CardDescription>{m.DRIVER_DAY_UI.eveningSubtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Notice tone="warning" testId="meter-evening-locked">
                    {ui.fillMorningFirst}
                  </Notice>
                </CardContent>
              </Card>
            ) : (
              <>
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
                  filled={todayLog.endReading != null}
                  filledLabel={ui.filledBadge}
                  onSaved={invalidateDay}
                />
              </>
            )}
          </div>
        </>
      )}
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
    apiErrorOf(m, mutation.error);

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
  filled,
  filledLabel,
  onSaved,
}: {
  vehicleId: UUID;
  driverPersonId: UUID;
  today: string;
  todayLog: VehicleLog;
  /** Whether today's endReading is already set — shows a green "Filled" badge
   * next to the title. The form itself still renders/stays editable either
   * way (upsert by the same log id) — unchanged from the old dashboard. */
  filled: boolean;
  filledLabel: string;
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
    apiErrorOf(m, mutation.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.DRIVER_DAY_UI.eveningTitle}</CardTitle>
        <CardDescription>{m.DRIVER_DAY_UI.eveningSubtitle}</CardDescription>
        {filled && (
          <CardAction>
            <span
              data-testid="meter-filled-badge-evening"
              className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              <Check className="size-4" aria-hidden="true" />
              {filledLabel}
            </span>
          </CardAction>
        )}
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
