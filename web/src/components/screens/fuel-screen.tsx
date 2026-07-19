'use client';

/**
 * SITE_MANAGER fuel entry — the "Fuel entry" sub-page of /site-manager/fuel
 * (see site-manager/fuel/page.tsx). The Driver's own fuel entry moved to its
 * own page in frozen.10 (`driver-fuel-screen.tsx` — vehicle locked, litres
 * primary, "I paid" tick, today-only, match-status badge); this screen now
 * serves SITE_MANAGER only.
 * GET /vehicles is server-scoped to the SM's sites' fleet: exactly one
 * renders as a fixed card, several as a native select.
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
import type { BusinessDate, CreateFuelLogInput, FuelLog, UUID, Vehicle } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, minEntryDate, todayKolkata } from '@/lib/business-date';
import { uploadPhoto } from '@/lib/media-upload';
import { apiErrorOf, type Messages } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
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

export function FuelScreen() {
  const m = useMessages();
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
    apiErrorOf(m, mutation.error);

  const vehicleLabel = (v: Vehicle) => (v.name ? `${v.regNo} · ${v.name}` : v.regNo);
  const regNoOf = (id: UUID) => {
    const v = vehicles?.find((x) => x.id === id);
    return v ? v.regNo : '';
  };

  return (
    <div className="grid gap-4" data-testid="fuel-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.ENTRY_UI.fuelTitle}</CardTitle>
          <CardDescription>{m.ENTRY_UI.fuelSubtitle}</CardDescription>
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
              min={minEntryDate('SITE_MANAGER', today)}
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
                // Site Manager entries carry no match badge — that's the Driver/Supervisor
                // diesel double-check only (see driver-fuel-screen.tsx / diesel-screen.tsx).
                secondary: f.amountPaise != null ? formatPaise(f.amountPaise) : '—',
                tertiary: `${f.businessDate} · ${f.litres} L · ${f.reading}`,
              }),
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
