'use client';

/**
 * SUPERVISOR diesel double-check (CW-5) — /supervisor/diesel.
 *
 * The client's model: the Supervisor buys diesel in bulk into SITE stock
 * (`POST /fuel-stock/purchases`), then issues it per vehicle
 * (`POST /fuel-stock/issuances`). The driver's own fuel entry (fuel-screen.tsx)
 * is the RECEIVED side of the same (vehicle, businessDate) pair — the backend
 * pairs the two automatically and raises a red flag when they disagree or one
 * side never shows up (see fuel-flags-card.tsx, mounted on the SM/Owner
 * dashboards, and the accountant's own work queue elsewhere).
 *
 * `GET /sites` and `GET /vehicles` are already server-scoped to the
 * Supervisor's own sites/crew, so this screen never filters by site itself —
 * "in stock" is just purchased − issued, summed per site from the two lists.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import type {
  BusinessDate,
  CreateFuelIssuanceInput,
  CreateFuelStockPurchaseInput,
  FuelIssuance,
  FuelStockPurchase,
  MaterialTxnStatus,
  Site,
  UUID,
  Vehicle,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ShowMore } from '@/components/ui/show-more';
import { DateField } from '@/components/entry/date-field';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

const UI = {
  en: {
    title: 'Diesel',
    subtitle: 'Buy bulk stock, then issue it per vehicle — this is your side of the diesel match.',
    stockTitle: 'Stock in hand',
    stockSubtitle: 'Purchased − issued, per site',
    noSites: 'No sites assigned to you yet',
    litresSuffix: 'L',
    buyTitle: 'Buy stock',
    buySubtitle: 'Record a bulk diesel purchase for a site',
    issueTitle: 'Issue to vehicle',
    issueSubtitle: 'Record diesel handed to a vehicle today',
    siteRequired: 'No site available',
    litresLabel: 'Litres',
    amountLabel: 'Amount (₹, optional)',
    noteLabel: 'Note (optional)',
    vehicleLabel: 'Vehicle',
    noVehicles: 'No vehicles on your sites yet',
    litresRequired: 'Enter litres greater than 0',
    submit: 'Save',
    saving: 'Saving…',
    stockSaved: 'Purchase saved',
    issueSaved: 'Issuance saved',
    issuancesTitle: 'Recent issuances',
    purchasesTitle: 'Recent purchases',
    issuancesEmpty: 'No issuances yet',
    purchasesEmpty: 'No purchases yet',
    statusPending: 'waiting for driver',
    statusConfirmed: 'confirmed',
    statusMismatch: 'mismatch',
    noteDash: '—',
  },
  hi: {
    title: 'डीज़ल',
    subtitle: 'पहले साइट पर थोक डीज़ल खरीदें, फिर हर गाड़ी को दें — यह मिलान का आपका हिस्सा है।',
    stockTitle: 'स्टॉक में डीज़ल',
    stockSubtitle: 'खरीदा − दिया, हर साइट के लिए',
    noSites: 'आपको अभी कोई साइट नहीं सौंपी गई',
    litresSuffix: 'लीटर',
    buyTitle: 'स्टॉक खरीदें',
    buySubtitle: 'साइट के लिए थोक डीज़ल खरीद दर्ज करें',
    issueTitle: 'गाड़ी को दें',
    issueSubtitle: 'आज गाड़ी को दिया गया डीज़ल दर्ज करें',
    siteRequired: 'कोई साइट उपलब्ध नहीं',
    litresLabel: 'लीटर',
    amountLabel: 'राशि (₹, वैकल्पिक)',
    noteLabel: 'टिप्पणी (वैकल्पिक)',
    vehicleLabel: 'गाड़ी',
    noVehicles: 'आपकी साइट पर अभी कोई गाड़ी नहीं है',
    litresRequired: '0 से ज़्यादा लीटर दर्ज करें',
    submit: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    stockSaved: 'खरीद सहेज ली गई',
    issueSaved: 'आपूर्ति सहेज ली गई',
    issuancesTitle: 'हाल की आपूर्ति',
    purchasesTitle: 'हाल की खरीद',
    issuancesEmpty: 'अभी तक कोई आपूर्ति नहीं',
    purchasesEmpty: 'अभी तक कोई खरीद नहीं',
    statusPending: 'ड्राइवर की एंट्री बाकी',
    statusConfirmed: 'मिलान हो गया',
    statusMismatch: 'बेमेल',
    noteDash: '—',
  },
} as const;

// Widened to plain `string` per key — `UI[locale]` is a union of the `en`/`hi`
// literal-string objects, and only the widened form is assignable from both.
type UiText = Record<keyof (typeof UI)['en'], string>;

function statusBadge(status: MaterialTxnStatus, ui: UiText): { label: string; tone: 'success' | 'warning' | 'error' } {
  if (status === 'CONFIRMED') return { label: `✓ ${ui.statusConfirmed}`, tone: 'success' };
  if (status === 'MISMATCH') return { label: `🚩 ${ui.statusMismatch}`, tone: 'error' };
  return { label: ui.statusPending, tone: 'warning' };
}

function StatusPill({ tone, children }: { tone: 'success' | 'warning' | 'error'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'success' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
        tone === 'error' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  );
}

export function DieselScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const qc = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const purchasesQ = useQuery({
    queryKey: ['fuel-stock', 'purchases'],
    queryFn: () => api<FuelStockPurchase[]>('GET', '/fuel-stock/purchases'),
  });
  const issuancesQ = useQuery({
    queryKey: ['fuel-stock', 'issuances'],
    queryFn: () => api<FuelIssuance[]>('GET', '/fuel-stock/issuances'),
  });

  const sites = sitesQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  const stockBySite = useMemo(() => {
    const map = new Map<UUID, { purchased: number; issued: number }>();
    for (const p of purchasesQ.data ?? []) {
      const e = map.get(p.siteId) ?? { purchased: 0, issued: 0 };
      e.purchased += p.litres;
      map.set(p.siteId, e);
    }
    for (const i of issuancesQ.data ?? []) {
      const e = map.get(i.siteId) ?? { purchased: 0, issued: 0 };
      e.issued += i.litres;
      map.set(i.siteId, e);
    }
    return map;
  }, [purchasesQ.data, issuancesQ.data]);

  const invalidateFuelStock = () => void qc.invalidateQueries({ queryKey: ['fuel-stock'] });

  const regNoOf = (id: UUID) => vehicles.find((v) => v.id === id)?.regNo ?? ui.noteDash;
  const siteNameOf = (id: UUID) => {
    const s = sites.find((x) => x.id === id);
    return s ? `${s.name} (${s.code})` : ui.noteDash;
  };

  const sortedIssuances = useMemo(
    () => [...(issuancesQ.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
    [issuancesQ.data],
  );
  const sortedPurchases = useMemo(
    () => [...(purchasesQ.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
    [purchasesQ.data],
  );

  return (
    <div className="grid gap-4" data-testid="diesel-screen">
      <div>
        <h1 className="text-lg font-semibold">{ui.title}</h1>
        <p className="text-sm text-muted-foreground">{ui.subtitle}</p>
      </div>

      <Card data-testid="diesel-stock-card">
        <CardHeader>
          <CardTitle>{ui.stockTitle}</CardTitle>
          <CardDescription>{ui.stockSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-16">
          {sitesQ.isPending || purchasesQ.isPending || issuancesQ.isPending ? (
            <LoadingState />
          ) : sitesQ.error ? (
            <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
          ) : purchasesQ.error ? (
            <ErrorState error={purchasesQ.error} onRetry={() => void purchasesQ.refetch()} />
          ) : issuancesQ.error ? (
            <ErrorState error={issuancesQ.error} onRetry={() => void issuancesQ.refetch()} />
          ) : sites.length === 0 ? (
            <EmptyState label={ui.noSites} />
          ) : (
            <ul className="divide-y" data-testid="diesel-stock-list">
              {sites.map((s) => {
                const e = stockBySite.get(s.id) ?? { purchased: 0, issued: 0 };
                const remaining = e.purchased - e.issued;
                return (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    data-testid={`diesel-stock-${s.id}`}
                  >
                    <span className="min-w-0 truncate text-sm">
                      {s.name} <span className="text-muted-foreground">({s.code})</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {remaining} {ui.litresSuffix}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <BuyStockForm
        ui={ui}
        sites={sitesQ.data}
        sitesLoading={sitesQ.isPending}
        sitesError={sitesQ.error}
        onRetrySites={() => void sitesQ.refetch()}
        today={today}
        onSaved={invalidateFuelStock}
      />

      <IssueToVehicleForm
        ui={ui}
        vehicles={vehicles}
        vehiclesLoading={vehiclesQ.isPending}
        vehiclesError={vehiclesQ.error}
        onRetryVehicles={() => void vehiclesQ.refetch()}
        today={today}
        onSaved={invalidateFuelStock}
      />

      <Card size="sm" data-testid="diesel-issuances-card">
        <CardHeader>
          <CardTitle>{ui.issuancesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {issuancesQ.isPending ? (
            <LoadingState />
          ) : issuancesQ.error ? (
            <ErrorState error={issuancesQ.error} onRetry={() => void issuancesQ.refetch()} />
          ) : sortedIssuances.length === 0 ? (
            <EmptyState label={ui.issuancesEmpty} />
          ) : (
            <ShowMore
              items={sortedIssuances}
              initial={7}
              as="ul"
              className="divide-y"
              testIdPrefix="diesel-issuances"
              renderItem={(row) => {
                const badge = statusBadge(row.status, ui);
                return (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    data-testid={`diesel-issuance-${row.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatBusinessDateShort(row.businessDate)} · {regNoOf(row.vehicleId)}
                      </p>
                      {row.note && <p className="truncate text-xs text-muted-foreground">{row.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums">
                        {row.litres} {ui.litresSuffix}
                      </span>
                      <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
                    </div>
                  </li>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card size="sm" data-testid="diesel-purchases-card">
        <CardHeader>
          <CardTitle>{ui.purchasesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {purchasesQ.isPending ? (
            <LoadingState />
          ) : purchasesQ.error ? (
            <ErrorState error={purchasesQ.error} onRetry={() => void purchasesQ.refetch()} />
          ) : sortedPurchases.length === 0 ? (
            <EmptyState label={ui.purchasesEmpty} />
          ) : (
            <ShowMore
              items={sortedPurchases}
              initial={7}
              as="ul"
              className="divide-y"
              testIdPrefix="diesel-purchases"
              renderItem={(row) => (
                <li
                  key={row.id}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  data-testid={`diesel-purchase-${row.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {formatBusinessDateShort(row.businessDate)} · {siteNameOf(row.siteId)}
                    </p>
                    {row.note && <p className="truncate text-xs text-muted-foreground">{row.note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-medium tabular-nums">
                      {row.litres} {ui.litresSuffix}
                    </span>
                    {row.amountPaise != null && (
                      <span className="text-xs text-muted-foreground tabular-nums">{formatPaise(row.amountPaise)}</span>
                    )}
                  </div>
                </li>
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buy stock form
// ---------------------------------------------------------------------------

function BuyStockForm({
  ui,
  sites,
  sitesLoading,
  sitesError,
  onRetrySites,
  today,
  onSaved,
}: {
  ui: UiText;
  sites: Site[] | undefined;
  sitesLoading: boolean;
  sitesError: unknown;
  onRetrySites: () => void;
  today: BusinessDate;
  onSaved: () => void;
}) {
  const m = useMessages();
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');
  const [litresText, setLitresText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<BusinessDate>(today);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');

  const create = useMutation({
    mutationFn: (input: CreateFuelStockPurchaseInput) => api<FuelStockPurchase>('POST', '/fuel-stock/purchases', input),
    onSuccess: () => {
      setLitresText('');
      setAmountText('');
      setNote('');
      setSaved(true);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const litres = Number(litresText);
    if (!(Number.isFinite(litres) && litres > 0)) {
      setFieldError(ui.litresRequired);
      return;
    }
    if (!siteId) {
      setFieldError(ui.siteRequired);
      return;
    }
    setFieldError(null);
    const amountRupees = Number(amountText);
    const hasAmount = amountText.trim() !== '' && Number.isFinite(amountRupees) && amountRupees > 0;
    const input: CreateFuelStockPurchaseInput = {
      id: uuidv7(),
      siteId,
      litres,
      businessDate: date,
      ...(hasAmount ? { amountPaise: rupeesToPaise(amountRupees) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    create.mutate(input);
  };

  return (
    <Card data-testid="diesel-buy-card">
      <CardHeader>
        <CardTitle>{ui.buyTitle}</CardTitle>
        <CardDescription>{ui.buySubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SitePicker
          sites={sites}
          isLoading={sitesLoading}
          value={siteId}
          onChange={setPickedSiteId}
          error={sitesError}
          onRetry={onRetrySites}
        />
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="diesel-buy-litres">{ui.litresLabel}</Label>
              <Input
                id="diesel-buy-litres"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="diesel-buy-litres"
                value={litresText}
                onChange={(e) => setLitresText(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="diesel-buy-amount">{ui.amountLabel}</Label>
              <Input
                id="diesel-buy-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="diesel-buy-amount"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </div>
          </div>
          {fieldError && (
            <p className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          )}

          <DateField id="diesel-buy-date" testId="diesel-buy-date" value={date} onChange={setDate} max={today} />

          <div className="grid gap-2">
            <Label htmlFor="diesel-buy-note">{ui.noteLabel}</Label>
            <Input id="diesel-buy-note" data-testid="diesel-buy-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="diesel-buy-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="diesel-buy-saved">
              {ui.stockSaved}
            </Notice>
          )}

          <Button type="submit" data-testid="diesel-buy-submit" disabled={create.isPending || !siteId}>
            {create.isPending ? ui.saving : ui.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Issue-to-vehicle form
// ---------------------------------------------------------------------------

function IssueToVehicleForm({
  ui,
  vehicles,
  vehiclesLoading,
  vehiclesError,
  onRetryVehicles,
  today,
  onSaved,
}: {
  ui: UiText;
  vehicles: Vehicle[];
  vehiclesLoading: boolean;
  vehiclesError: unknown;
  onRetryVehicles: () => void;
  today: BusinessDate;
  onSaved: () => void;
}) {
  const m = useMessages();
  const [pickedVehicleId, setPickedVehicleId] = useState<UUID | ''>('');
  const [litresText, setLitresText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<BusinessDate>(today);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const vehicleId: UUID | '' = pickedVehicleId !== '' ? pickedVehicleId : (vehicles[0]?.id ?? '');
  const vehicleLabel = (v: Vehicle) => (v.name ? `${v.regNo} · ${v.name}` : v.regNo);

  const create = useMutation({
    mutationFn: (input: CreateFuelIssuanceInput) => api<FuelIssuance>('POST', '/fuel-stock/issuances', input),
    onSuccess: () => {
      setLitresText('');
      setNote('');
      setSaved(true);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const litres = Number(litresText);
    if (!(Number.isFinite(litres) && litres > 0)) {
      setFieldError(ui.litresRequired);
      return;
    }
    if (!vehicleId) return;
    setFieldError(null);
    const input: CreateFuelIssuanceInput = {
      id: uuidv7(),
      vehicleId,
      litres,
      businessDate: date,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    create.mutate(input);
  };

  return (
    <Card data-testid="diesel-issue-card">
      <CardHeader>
        <CardTitle>{ui.issueTitle}</CardTitle>
        <CardDescription>{ui.issueSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="diesel-issue-vehicle">{ui.vehicleLabel}</Label>
          {vehiclesLoading ? (
            <LoadingState />
          ) : vehiclesError ? (
            <ErrorState error={vehiclesError} onRetry={onRetryVehicles} />
          ) : vehicles.length === 0 ? (
            <EmptyState label={ui.noVehicles} />
          ) : vehicles.length === 1 ? (
            <p
              id="diesel-issue-vehicle"
              data-testid="diesel-issue-vehicle-fixed"
              className="flex h-8 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
            >
              <Truck className="size-4 text-muted-foreground" aria-hidden="true" />
              {vehicleLabel(vehicles[0]!)}
            </p>
          ) : (
            <NativeSelect
              id="diesel-issue-vehicle"
              data-testid="diesel-issue-vehicle"
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

        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="diesel-issue-litres">{ui.litresLabel}</Label>
            <Input
              id="diesel-issue-litres"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              data-testid="diesel-issue-litres"
              value={litresText}
              onChange={(e) => setLitresText(e.target.value)}
            />
          </div>
          {fieldError && (
            <p className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          )}

          <DateField id="diesel-issue-date" testId="diesel-issue-date" value={date} onChange={setDate} max={today} />

          <div className="grid gap-2">
            <Label htmlFor="diesel-issue-note">{ui.noteLabel}</Label>
            <Input id="diesel-issue-note" data-testid="diesel-issue-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="diesel-issue-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="diesel-issue-saved">
              {ui.issueSaved}
            </Notice>
          )}

          <Button type="submit" data-testid="diesel-issue-submit" disabled={create.isPending || !vehicleId}>
            {create.isPending ? ui.saving : ui.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
