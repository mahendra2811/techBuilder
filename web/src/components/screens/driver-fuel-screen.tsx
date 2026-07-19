'use client';

/**
 * Driver fuel page (/driver/fuel) — DRV-2/DRV-4 (docs/role-page-map/driver/
 * driver-role-updates.md, frozen.10): the driver's "today's fuel update",
 * split out of the old combined `/driver/vehicle` page (see
 * `fuel-screen.tsx`'s doc comment — its DRIVER branch is now superseded by
 * this screen; that file keeps serving the SITE_MANAGER variant unchanged).
 *
 * Differences from the old shared FuelScreen's driver branch:
 *   - Vehicle is LOCKED to the driver's assigned vehicle (read-only row, from
 *     GET /vehicles/my-snapshot) — no picker.
 *   - Litres is the primary field (feeds the supervisor's diesel match);
 *     amount ₹ is now OPTIONAL and hidden behind an "I paid money" tick —
 *     ~95% of fills come from site stock / the shop's khata, no money out of
 *     the driver's pocket. Unticked → POST omits amountPaise (server stores
 *     amountPaise=null, paidByDriver=false).
 *   - No date field at all — always businessDate = today (server also
 *     enforces this for role DRIVER).
 * Recent fuel entries (7 days, moved off the dashboard per D3) render below
 * the form with the same match-status badge as before.
 */
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import type { CreateFuelLogInput, FuelLog, UUID, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhoto } from '@/lib/media-upload';
import { apiErrorOf, type Messages, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PhotoField } from '@/components/entry/photo-field';
import { RecentEntries, type RecentRow } from '@/components/entry/recent-entries';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { materialTxnStatusBadge } from '@/components/fuel-stock/status-badge';

/** Module-local bilingual strings (repo convention: messages catalogs are for
 * NAV_LABELS only — screen copy stays local, mirrors DRIVER_FUEL_UI in the
 * (now superseded for DRIVER) shared fuel-screen.tsx). */
const DRIVER_FUEL_PAGE_UI = {
  en: {
    title: 'How much diesel did you receive today?',
    subtitle: "Enter what the vehicle actually got — we'll match it against the supervisor's issue.",
    paidLabel: 'I paid money',
    unpaidHint: "From site stock / shop khata — no money paid.",
    amountRequired: 'Enter the amount you paid.',
    statusPending: 'awaiting match',
    statusConfirmed: 'confirmed',
    statusMismatch: 'mismatch',
  },
  hi: {
    title: 'आज कितना डीज़ल मिला?',
    subtitle: 'गाड़ी को असल में जो डीज़ल मिला वह दर्ज करें — हम इसे सुपरवाइज़र की एंट्री से मिलाएँगे।',
    paidLabel: 'मैंने पैसे दिए',
    unpaidHint: 'साइट स्टॉक / दुकान के खाते से — कोई पैसा नहीं दिया गया।',
    amountRequired: 'आपने जो राशि दी है वह दर्ज करें।',
    statusPending: 'मिलान बाकी',
    statusConfirmed: 'मिलान हो गया',
    statusMismatch: 'बेमेल',
  },
} as const;

type DriverFuelPageUi = UiStrings<typeof DRIVER_FUEL_PAGE_UI>;

// `paid` is closed over (component `useState`, NOT a registered RHF field) — cross-field
// "amount required only if paid" validation without needing react-hook-form's `watch()`
// (its returned function can't be safely memoized by the React Compiler; see eslint
// react-hooks/incompatible-library).
const makeDriverFuelFormSchema = (e: Messages['ENTRY_UI'], ui: DriverFuelPageUi, paid: boolean) =>
  z
    .object({
      reading: z
        .string()
        .min(1, e.readingInvalid)
        .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, e.readingInvalid),
      litres: z
        .string()
        .min(1, e.litresInvalid)
        .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, e.litresInvalid),
      amountRupees: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (paid && (!val.amountRupees?.trim() || !Number.isFinite(Number(val.amountRupees)) || Number(val.amountRupees) <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ui.amountRequired, path: ['amountRupees'] });
      }
    });
type DriverFuelForm = z.infer<ReturnType<typeof makeDriverFuelFormSchema>>;

export function DriverFuelScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = DRIVER_FUEL_PAGE_UI[locale];
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [paid, setPaid] = useState(false);

  const snapshotQ = useQuery({
    queryKey: ['vehicles', 'my-snapshot'],
    queryFn: () => api<VehicleSnapshot>('GET', '/vehicles/my-snapshot'),
    retry: false, // NOT_FOUND ("no vehicle yet") is an expected empty state, not a transient failure
  });
  const vehicle = snapshotQ.data?.vehicle ?? null;
  const noVehicle = snapshotQ.error instanceof ApiClientError && snapshotQ.error.code === 'NOT_FOUND';

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
  } = useForm<DriverFuelForm>({
    resolver: zodResolver(useMemo(() => makeDriverFuelFormSchema(m.ENTRY_UI, ui, paid), [m, ui, paid])),
    defaultValues: { reading: '', litres: '', amountRupees: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: DriverFuelForm) => {
      if (!vehicle) throw new Error('No vehicle assigned.'); // guarded — form only renders when `vehicle` is set
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
        vehicleId: vehicle.id,
        litres: Number(values.litres),
        reading: Number(values.reading),
        receiptMediaId,
        businessDate: today,
        // frozen.10 (DRV-4/D4): omit amountPaise entirely when unticked — the
        // server stores amountPaise=null, paidByDriver=false (from store/khata).
        ...(paid ? { amountPaise: rupeesToPaise(Number(values.amountRupees)), paidByDriver: true } : {}),
      };
      await api<FuelLog>('POST', '/records/fuel', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => {
      reset();
      setPaid(false);
      setPhoto(null);
      setPhotoWarning(photoFailed);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['records', 'fuel'] });
    },
    onError: () => setSaved(false),
  });

  const serverError =
    apiErrorOf(m, mutation.error);

  return (
    <div className="grid gap-4" data-testid="driver-fuel-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="driver-fuel-vehicle">{m.ENTRY_UI.vehicle}</Label>
            {snapshotQ.isPending ? (
              <LoadingState />
            ) : noVehicle ? (
              <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
            ) : snapshotQ.error ? (
              <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
            ) : (
              vehicle && (
                <p
                  id="driver-fuel-vehicle"
                  data-testid="driver-fuel-vehicle"
                  className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
                >
                  <Truck className="size-4 text-muted-foreground" aria-hidden="true" />
                  {vehicle.name ? `${vehicle.regNo} · ${vehicle.name}` : vehicle.regNo}
                </p>
              )
            )}
          </div>

          {vehicle && (
            <form
              className="grid gap-4"
              noValidate
              onSubmit={handleSubmit((values) => {
                setSaved(false);
                setPhotoWarning(false);
                mutation.mutate(values);
              })}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="driver-fuel-reading">{m.ENTRY_UI.reading}</Label>
                  <Input
                    id="driver-fuel-reading"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    data-testid="driver-fuel-reading"
                    {...register('reading')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="driver-fuel-litres">{m.ENTRY_UI.litres}</Label>
                  <Input
                    id="driver-fuel-litres"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    data-testid="driver-fuel-litres"
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
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="driver-fuel-paid"
                    checked={paid}
                    onCheckedChange={setPaid}
                    data-testid="driver-fuel-paid"
                  />
                  <Label htmlFor="driver-fuel-paid" className="cursor-pointer font-normal">
                    {ui.paidLabel}
                  </Label>
                </div>

                {paid ? (
                  <div className="grid gap-2">
                    <Label htmlFor="driver-fuel-amount">{m.ENTRY_UI.amountRupees}</Label>
                    <Input
                      id="driver-fuel-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      data-testid="driver-fuel-amount"
                      {...register('amountRupees')}
                    />
                    {errors.amountRupees && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors.amountRupees.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="driver-fuel-unpaid-hint">
                    {ui.unpaidHint}
                  </p>
                )}
              </div>

              <PhotoField file={photo} onChange={setPhoto} testId="driver-fuel-photo" />

              {serverError && (
                <Notice tone="error" testId="driver-fuel-error">
                  {serverError}
                </Notice>
              )}
              {saved && (
                <div className="grid gap-2">
                  <Notice tone="success" testId="driver-fuel-saved">
                    {m.ENTRY_UI.fuelSaved}
                  </Notice>
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setSaved(false)}>
                    {m.ENTRY_UI.enterAnother}
                  </Button>
                </div>
              )}
              {photoWarning && (
                <Notice tone="warning" testId="driver-fuel-photo-warning">
                  {m.ENTRY_UI.photoNotUploaded}
                </Notice>
              )}

              <Button type="submit" data-testid="driver-fuel-submit" disabled={mutation.isPending}>
                {mutation.isPending ? m.ENTRY_UI.saving : m.ENTRY_UI.fuelSubmit}
              </Button>
            </form>
          )}

          <Separator />

          <RecentEntries
            testId="driver-recent-fuel"
            isLoading={recentQ.isPending}
            error={recentQ.error}
            onRetry={() => void recentQ.refetch()}
            rows={recentQ.data?.map(
              (f): RecentRow => ({
                id: f.id,
                primary: `${f.litres} L`,
                secondary: f.amountPaise != null ? formatPaise(f.amountPaise) : '—',
                tertiary: `${f.businessDate} · ${f.litres} L · ${f.reading}`,
                badge: materialTxnStatusBadge(f.status, ui),
              }),
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
