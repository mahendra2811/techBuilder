'use client';

/**
 * SUPERVISOR diesel double-check (CW-5, restructured frozen.10 / SUP-3) — /supervisor/diesel.
 *
 * The client's model: the Supervisor buys diesel in bulk into SITE stock
 * (`POST /fuel-stock/purchases`), then issues it per vehicle
 * (`POST /fuel-stock/issuances`). The driver's own fuel entry (fuel-screen.tsx)
 * is the RECEIVED side of the same (vehicle, businessDate) pair — the backend
 * pairs the two automatically and raises a red flag when they disagree or one
 * side never shows up (see fuel-flags-card.tsx, mounted on the SM/Owner
 * dashboards, and the accountant's own work queue elsewhere).
 *
 * `GET /sites` and `GET /vehicles` are server-scoped to the Supervisor's ONE
 * assigned site (frozen.10 SUP-2: single-site rule) — no site picker anywhere
 * on this screen; the site renders as a fixed label.
 *
 * frozen.10 (SUP-3) restructure: two sub-page sections ("Buy stock" / "Issue
 * to vehicle") behind `useSubPage`, each with its own lazy "recent" history
 * (`LazyHistorySection` — collapsed by default, fetched only once revealed).
 * Date fields on both forms are limited to today + yesterday
 * (`minEntryDate('SUPERVISOR', today)` — see `lib/business-date.ts`).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import type {
  BusinessDate,
  CreateFuelIssuanceInput,
  CreateFuelStockPurchaseInput,
  FuelIssuance,
  FuelStockPurchase,
  Site,
  UUID,
  Vehicle,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { minEntryDate, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { useLazySection, LazyHistorySection } from '@/components/ui/lazy-history';
import { PurchaseRow } from '@/components/fuel-stock/purchase-row';
import { IssuanceRow } from '@/components/fuel-stock/issuance-row';

const UI = {
  en: {
    title: 'Diesel',
    subtitle: 'Buy bulk stock, then issue it per vehicle — this is your side of the diesel match.',
    stockTitle: 'Stock in hand',
    stockSubtitle: 'Purchased − issued, at your site',
    noSites: 'No site assigned to you yet',
    litresSuffix: 'L',
    buyTitle: 'Buy stock',
    buySubtitle: 'Record a bulk diesel purchase for your site',
    issueTitle: 'Issue to vehicle',
    issueSubtitle: 'Record diesel handed to a vehicle',
    siteRequired: 'No site available',
    litresLabel: 'Litres',
    amountLabel: 'Amount (₹, optional)',
    noteLabel: 'Note (optional)',
    vehicleLabel: 'Vehicle',
    noVehicles: 'No vehicles on your site yet',
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
    goBuy: 'Buy stock',
    goBuyHint: 'Record diesel arriving at your site',
    goIssue: 'Issue to vehicle',
    goIssueHint: 'Hand diesel out to a vehicle',
  },
  hi: {
    title: 'डीज़ल',
    subtitle: 'पहले साइट पर थोक डीज़ल खरीदें, फिर हर गाड़ी को दें — यह मिलान का आपका हिस्सा है।',
    stockTitle: 'स्टॉक में डीज़ल',
    stockSubtitle: 'खरीदा − दिया, आपकी साइट पर',
    noSites: 'आपको अभी कोई साइट नहीं सौंपी गई',
    litresSuffix: 'लीटर',
    buyTitle: 'स्टॉक ख़रीद',
    buySubtitle: 'अपनी साइट के लिए थोक डीज़ल खरीद दर्ज करें',
    issueTitle: 'वाहन को देना',
    issueSubtitle: 'गाड़ी को दिया गया डीज़ल दर्ज करें',
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
    goBuy: 'स्टॉक ख़रीद',
    goBuyHint: 'साइट पर आया डीज़ल दर्ज करें',
    goIssue: 'वाहन को देना',
    goIssueHint: 'गाड़ी को डीज़ल दें',
  },
} as const;

// Widened to plain `string` per key — `UI[locale]` is a union of the `en`/`hi`
// literal-string objects, and only the widened form is assignable from both.
type UiText = Record<keyof (typeof UI)['en'], string>;

type DieselSection = 'buy' | 'issue';

export function DieselScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const qc = useQueryClient();
  const today = todayKolkata();
  const { current, open, close } = useSubPage<DieselSection>();

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  // Needed unconditionally for the stock-in-hand total (no lighter summary endpoint exists);
  // the lazy "recent" sections below reuse the SAME query key so opening them never
  // double-fetches — they just read whatever this eager call has already resolved.
  const purchasesQ = useQuery({
    queryKey: ['fuel-stock', 'purchases'],
    queryFn: () => api<FuelStockPurchase[]>('GET', '/fuel-stock/purchases'),
  });
  const issuancesQ = useQuery({
    queryKey: ['fuel-stock', 'issuances'],
    queryFn: () => api<FuelIssuance[]>('GET', '/fuel-stock/issuances'),
  });

  const sites = sitesQ.data ?? [];
  const site = sites[0]; // frozen.10 (SUP-2): supervisor has exactly one site — no picker.
  const vehicles = vehiclesQ.data ?? [];

  const stock = (() => {
    let purchased = 0;
    let issued = 0;
    for (const p of purchasesQ.data ?? []) purchased += p.litres;
    for (const i of issuancesQ.data ?? []) issued += i.litres;
    return purchased - issued;
  })();

  const invalidateFuelStock = () => void qc.invalidateQueries({ queryKey: ['fuel-stock'] });

  const regNoOf = (id: UUID) => vehicles.find((v) => v.id === id)?.regNo ?? ui.noteDash;

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
          ) : !site ? (
            <EmptyState label={ui.noSites} />
          ) : (
            <div className="flex items-baseline justify-between gap-3" data-testid="diesel-stock-row">
              <span className="min-w-0 truncate text-sm">
                {site.name} <span className="text-muted-foreground">({site.code})</span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {stock} {ui.litresSuffix}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {current === null && (
        <>
          <NavCard
            title={ui.goBuy}
            subtitle={ui.goBuyHint}
            testId="diesel-nav-buy"
            onClick={() => open('buy')}
          />
          <NavCard
            title={ui.goIssue}
            subtitle={ui.goIssueHint}
            testId="diesel-nav-issue"
            onClick={() => open('issue')}
          />
        </>
      )}

      {current === 'buy' && (
        <div className="grid gap-4" data-testid="diesel-buy-page">
          <SubPageHeader title={ui.buyTitle} onBack={close} />
          <BuyStockForm
            ui={ui}
            site={site}
            sitesLoading={sitesQ.isPending}
            sitesError={sitesQ.error}
            onRetrySites={() => void sitesQ.refetch()}
            today={today}
            onSaved={invalidateFuelStock}
          />
          <RecentPurchasesSection ui={ui} />
        </div>
      )}

      {current === 'issue' && (
        <div className="grid gap-4" data-testid="diesel-issue-page">
          <SubPageHeader title={ui.issueTitle} onBack={close} />
          <IssueToVehicleForm
            ui={ui}
            vehicles={vehicles}
            vehiclesLoading={vehiclesQ.isPending}
            vehiclesError={vehiclesQ.error}
            onRetryVehicles={() => void vehiclesQ.refetch()}
            today={today}
            onSaved={invalidateFuelStock}
          />
          <RecentIssuancesSection ui={ui} regNoOf={regNoOf} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing nav card (list → detail sub-page pattern)
// ---------------------------------------------------------------------------

function NavCard({
  title,
  subtitle,
  testId,
  onClick,
}: {
  title: string;
  subtitle: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent>
        <button type="button" className="flex w-full items-center gap-3 text-left" onClick={onClick}>
          <Truck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Buy stock form — site is auto (single-site, SUP-2): fixed label, no picker.
// ---------------------------------------------------------------------------

function BuyStockForm({
  ui,
  site,
  sitesLoading,
  sitesError,
  onRetrySites,
  today,
  onSaved,
}: {
  ui: UiText;
  site: Site | undefined;
  sitesLoading: boolean;
  sitesError: unknown;
  onRetrySites: () => void;
  today: BusinessDate;
  onSaved: () => void;
}) {
  const m = useMessages();
  const [litresText, setLitresText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<BusinessDate>(today);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const siteId: UUID | '' = site?.id ?? '';
  const minDate = minEntryDate('SUPERVISOR', today);

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
        {sitesLoading ? (
          <LoadingState />
        ) : sitesError ? (
          <ErrorState error={sitesError} onRetry={onRetrySites} />
        ) : !site ? (
          <EmptyState label={ui.noSites} />
        ) : (
          <p
            data-testid="diesel-buy-site-fixed"
            className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
          >
            {site.name} ({site.code})
          </p>
        )}
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

          <DateField id="diesel-buy-date" testId="diesel-buy-date" value={date} onChange={setDate} min={minDate} max={today} />

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
  const minDate = minEntryDate('SUPERVISOR', today);

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

          <DateField id="diesel-issue-date" testId="diesel-issue-date" value={date} onChange={setDate} min={minDate} max={today} />

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

// ---------------------------------------------------------------------------
// Lazy "recent" history sections (SUP-3) — collapsed by default; the query is
// gated on `shown` (same queryKey as the eager stock queries above, so opening
// this after the stock card has already loaded is an instant cache hit, not a
// second network round trip).
// ---------------------------------------------------------------------------

function RecentPurchasesSection({ ui }: { ui: UiText }) {
  const { shown, show } = useLazySection();
  const q = useQuery({
    queryKey: ['fuel-stock', 'purchases'],
    queryFn: () => api<FuelStockPurchase[]>('GET', '/fuel-stock/purchases'),
    enabled: shown,
  });
  const sorted = [...(q.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 30);

  return (
    <Card size="sm" data-testid="diesel-purchases-card">
      <CardContent>
        <LazyHistorySection
          title={ui.purchasesTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={() => void q.refetch()}
          refreshing={q.isFetching}
          testId="diesel-purchases-history"
        >
          {q.isPending ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : sorted.length === 0 ? (
            <EmptyState label={ui.purchasesEmpty} />
          ) : (
            <ul className="divide-y" data-testid="diesel-purchases-list">
              {sorted.map((row) => (
                <PurchaseRow key={row.id} row={row} litresSuffix={ui.litresSuffix} testIdPrefix="diesel-purchase" />
              ))}
            </ul>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}

function RecentIssuancesSection({ ui, regNoOf }: { ui: UiText; regNoOf: (id: UUID) => string }) {
  const { shown, show } = useLazySection();
  const q = useQuery({
    queryKey: ['fuel-stock', 'issuances'],
    queryFn: () => api<FuelIssuance[]>('GET', '/fuel-stock/issuances'),
    enabled: shown,
  });
  const sorted = [...(q.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 30);

  return (
    <Card size="sm" data-testid="diesel-issuances-card">
      <CardContent>
        <LazyHistorySection
          title={ui.issuancesTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={() => void q.refetch()}
          refreshing={q.isFetching}
          testId="diesel-issuances-history"
        >
          {q.isPending ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : sorted.length === 0 ? (
            <EmptyState label={ui.issuancesEmpty} />
          ) : (
            <ul className="divide-y" data-testid="diesel-issuances-list">
              {sorted.map((row) => (
                <IssuanceRow
                  key={row.id}
                  row={row}
                  litresSuffix={ui.litresSuffix}
                  testIdPrefix="diesel-issuance"
                  regNo={regNoOf(row.vehicleId)}
                  ui={ui}
                />
              ))}
            </ul>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}
