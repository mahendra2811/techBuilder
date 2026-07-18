'use client';

/**
 * Fuel entry (DRIVER — /driver/vehicle; SITE_MANAGER — /site-manager/vehicle).
 * GET /vehicles is server-scoped per role (driver: assigned vehicle(s); SM:
 * their sites' fleet): exactly one renders as a fixed card, several as a
 * native select. `role` only widens the date picker to the role's backdating
 * window — the form, save flow and recent list are identical.
 * After save: green saved state + "Enter another" (form resets).
 * Recent fuel entries (7 days, already vehicle-scoped) listed below.
 */
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import type { BusinessDate, CreateFuelLogInput, FuelLog, MaterialTxnStatus, UUID, Vehicle } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, minEntryDate, todayKolkata } from '@/lib/business-date';
import { uploadPhoto } from '@/lib/media-upload';
import { apiErrorMessage, type Messages } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { DateField } from '@/components/entry/date-field';
import { PhotoField } from '@/components/entry/photo-field';
import { RecentEntries, type RecentRow } from '@/components/entry/recent-entries';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

/**
 * CW-5 (Round 2): the driver's fuel entry IS the received side of the diesel
 * double-check (the supervisor's issuance is the other side — see
 * diesel-screen.tsx). DRIVER only gets the "received" framing + a match-status
 * badge on the recent list; SITE_MANAGER copy/behaviour is untouched (still
 * the shared ENTRY_UI catalog strings) since an SM logging their own vehicle's
 * fuel isn't part of this double-check.
 */
const DRIVER_FUEL_UI = {
  en: {
    title: 'How much diesel did you receive today?',
    subtitle: "Enter what the vehicle actually got — we'll match it against the supervisor's issue.",
    statusPending: 'awaiting match',
    statusConfirmed: 'confirmed',
    statusMismatch: 'mismatch',
  },
  hi: {
    title: 'आज कितना डीज़ल मिला?',
    subtitle: 'गाड़ी को असल में जो डीज़ल मिला वह दर्ज करें — हम इसे सुपरवाइज़र की एंट्री से मिलाएँगे।',
    statusPending: 'मिलान बाकी',
    statusConfirmed: 'मिलान हो गया',
    statusMismatch: 'बेमेल',
  },
} as const;

// Widened to plain `string` per key — `DRIVER_FUEL_UI[locale]` is a union of the
// `en`/`hi` literal-string objects, and only the widened form is assignable from both.
type DriverFuelUi = Record<keyof (typeof DRIVER_FUEL_UI)['en'], string>;

function fuelStatusBadge(
  status: MaterialTxnStatus,
  ui: DriverFuelUi,
): { label: string; tone: 'success' | 'warning' | 'error' } {
  if (status === 'CONFIRMED') return { label: `✓ ${ui.statusConfirmed}`, tone: 'success' };
  if (status === 'MISMATCH') return { label: `🚩 ${ui.statusMismatch}`, tone: 'error' };
  return { label: ui.statusPending, tone: 'warning' };
}

// Local FORM schema only (UX); the DTO comes from the frozen contracts.
// Built per-locale (messages).
const makeFuelFormSchema = (e: Messages['ENTRY_UI']) =>
  z.object({
    reading: z
      .string()
      .min(1, e.readingInvalid)
      .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, e.readingInvalid),
    litres: z
      .string()
      .min(1, e.litresInvalid)
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, e.litresInvalid),
    amountRupees: z
      .string()
      .min(1, e.amountInvalid)
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, e.amountInvalid),
  });
type FuelForm = z.infer<ReturnType<typeof makeFuelFormSchema>>;

export function FuelScreen({ role = 'DRIVER' }: { role?: 'DRIVER' | 'SITE_MANAGER' }) {
  const m = useMessages();
  const locale = useLocale();
  const driverUi = DRIVER_FUEL_UI[locale];
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const [date, setDate] = useState<BusinessDate>(today);
  const [pickedVehicleId, setPickedVehicleId] = useState<UUID | ''>('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [saved, setSaved] = useState(false);

  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  // Default to the first scoped vehicle (drivers normally have exactly one) — derived, no effect.
  const vehicles = vehiclesQ.data;
  const vehicleId: UUID | '' = pickedVehicleId !== '' ? pickedVehicleId : (vehicles?.[0]?.id ?? '');

  const recentQ = useQuery({
    queryKey: ['records', 'fuel'],
    queryFn: () => {
      const qs = new URLSearchParams({ from: addDays(today, -7), to: today });
      return api<FuelLog[]>('GET', `/records/fuel?${qs}`);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FuelForm>({
    resolver: zodResolver(useMemo(() => makeFuelFormSchema(m.ENTRY_UI), [m])),
    defaultValues: { reading: '', litres: '', amountRupees: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: FuelForm) => {
      const id = uuidv7();
      let receiptMediaId: UUID | undefined;
      let photoFailed = false;
      if (photo) {
        const mediaId = await uploadPhoto(photo, { kind: 'RECEIPT', parentType: 'fuel', parentId: id });
        if (mediaId) receiptMediaId = mediaId;
        else photoFailed = true;
      }
      const input: CreateFuelLogInput = {
        id,
        vehicleId: vehicleId as UUID,
        amountPaise: rupeesToPaise(Number(values.amountRupees)),
        litres: Number(values.litres),
        reading: Number(values.reading),
        receiptMediaId,
        businessDate: date,
      };
      await api<FuelLog>('POST', '/records/fuel', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => {
      reset();
      setPhoto(null);
      setPhotoWarning(photoFailed);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['records', 'fuel'] });
    },
    onError: () => setSaved(false),
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  const vehicleLabel = (v: Vehicle) => (v.name ? `${v.regNo} · ${v.name}` : v.regNo);
  const regNoOf = (id: UUID) => {
    const v = vehicles?.find((x) => x.id === id);
    return v ? v.regNo : '';
  };

  return (
    <div className="grid gap-4" data-testid="fuel-screen">
      <Card>
        <CardHeader>
          <CardTitle>{role === 'DRIVER' ? driverUi.title : m.ENTRY_UI.fuelTitle}</CardTitle>
          <CardDescription>{role === 'DRIVER' ? driverUi.subtitle : m.ENTRY_UI.fuelSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="fuel-vehicle">{m.ENTRY_UI.vehicle}</Label>
            {vehiclesQ.isPending ? (
              <LoadingState />
            ) : vehiclesQ.error ? (
              <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
            ) : !vehicles || vehicles.length === 0 ? (
              <EmptyState label={m.ENTRY_UI.noVehicle} />
            ) : vehicles.length === 1 ? (
              <p
                id="fuel-vehicle"
                data-testid="fuel-vehicle"
                className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
              >
                <Truck className="size-4 text-muted-foreground" aria-hidden="true" />
                {vehicleLabel(vehicles[0]!)}
              </p>
            ) : (
              <NativeSelect
                id="fuel-vehicle"
                data-testid="fuel-vehicle"
                value={vehicleId}
                onChange={(e) => setPickedVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          <form
            className="grid gap-4"
            noValidate
            onSubmit={handleSubmit((values) => {
              if (!vehicleId) return;
              setSaved(false);
              setPhotoWarning(false);
              mutation.mutate(values);
            })}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="fuel-reading">{m.ENTRY_UI.reading}</Label>
                <Input
                  id="fuel-reading"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  data-testid="fuel-reading"
                  {...register('reading')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fuel-litres">{m.ENTRY_UI.litres}</Label>
                <Input
                  id="fuel-litres"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  data-testid="fuel-litres"
                  {...register('litres')}
                />
              </div>
            </div>
            {(errors.reading || errors.litres) && (
              <p className="text-sm text-destructive" role="alert">
                {errors.reading?.message ?? errors.litres?.message}
              </p>
            )}

            <div className="grid gap-2">
              <Label htmlFor="fuel-amount">{m.ENTRY_UI.amountRupees}</Label>
              <Input
                id="fuel-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="fuel-amount"
                {...register('amountRupees')}
              />
              {errors.amountRupees && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.amountRupees.message}
                </p>
              )}
            </div>

            <DateField
              id="fuel-date"
              testId="fuel-date"
              value={date}
              onChange={setDate}
              min={minEntryDate(role, today)}
              max={today}
            />

            <PhotoField file={photo} onChange={setPhoto} testId="fuel-photo" />

            {serverError && (
              <Notice tone="error" testId="fuel-error">
                {serverError}
              </Notice>
            )}
            {saved && (
              <div className="grid gap-2">
                <Notice tone="success" testId="fuel-saved">
                  {m.ENTRY_UI.fuelSaved}
                </Notice>
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setSaved(false)}>
                  {m.ENTRY_UI.enterAnother}
                </Button>
              </div>
            )}
            {photoWarning && (
              <Notice tone="warning" testId="fuel-photo-warning">
                {m.ENTRY_UI.photoNotUploaded}
              </Notice>
            )}

            <Button type="submit" data-testid="fuel-submit" disabled={mutation.isPending || !vehicleId}>
              {mutation.isPending ? m.ENTRY_UI.saving : m.ENTRY_UI.fuelSubmit}
            </Button>
          </form>

          <Separator />

          <RecentEntries
            testId="recent-fuel"
            isLoading={recentQ.isPending}
            error={recentQ.error}
            onRetry={() => void recentQ.refetch()}
            rows={recentQ.data?.map(
              (f): RecentRow => ({
                id: f.id,
                primary: regNoOf(f.vehicleId) || `${f.litres} L`,
                // frozen.10 (DRV-4): amountPaise is null when diesel came from site
                // stock/khata (no money paid) — render '—', never feed null to formatPaise.
                secondary: f.amountPaise != null ? formatPaise(f.amountPaise) : '—',
                tertiary: `${f.businessDate} · ${f.litres} L · ${f.reading}`,
                badge: role === 'DRIVER' ? fuelStatusBadge(f.status, driverUi) : undefined,
              }),
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
