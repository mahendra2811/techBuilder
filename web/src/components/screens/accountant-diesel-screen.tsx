'use client';

/**
 * Accountant Diesel monitor (/accountant/diesel) — new page, client request 2026-07-18.
 *
 * SM testing-feedback round 2: also reused, UNCHANGED, as the "Fuel monitor" sub-page of
 * `/site-manager/fuel` (see site-manager/fuel/page.tsx). `role` only widens the outer
 * `data-testid` so e2e tests can tell which mount they're on — every query below already
 * scopes to SITE_MANAGER server-side (fuel-stock.service.ts / vehicles.service.ts /
 * sites.service.ts all narrow `ctx.siteIds` identically for ACCOUNTANT and SITE_MANAGER), so
 * no other branching is needed here. The accountant's own /accountant/diesel page still
 * mounts this with no props (role defaults to 'ACCOUNTANT') — behaviourally identical.
 *
 * Read-only full diesel visibility for the caller's own site(s) (`sites.accountantId` scope
 * — see `backend/src/common/scope.util.ts`, mirrors the Supervisor's single-site pattern but an
 * accountant can be attached to more than one site). No forms here — buying stock / issuing to a
 * vehicle stays the Supervisor's job (`components/screens/diesel-screen.tsx`); this screen only
 * shows:
 *   - current stock per site (purchased − issued, GET /fuel-stock/purchases + /issuances),
 *   - the purchases + issuances history (lazy, `LazyHistorySection` — same idiom as the
 *     Supervisor screen: the lazy sections reuse the SAME query key as the eager stock fetch, so
 *     opening one is an instant cache hit, never a second round trip),
 *   - the 🚩 match-flag list (eager, GET /fuel-stock/flags — this is the same data the dashboard's
 *     brief "Diesel" card counts, just with vehicle regNo + site name resolved here).
 *
 * GET /sites and GET /vehicles are both scoped server-side to the accountant's own site(s)
 * (frozen.11 — `VehiclesService.list` gained an ACCOUNTANT branch; `SitesService.list` already
 * had one), so no manual filtering is needed here beyond what the backend already returns.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  FuelIssuance,
  FuelMatchFlag,
  FuelStockPurchase,
  MaterialTxnStatus,
  Site,
  UUID,
  Vehicle,
} from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDateShort } from '@/lib/business-date';
import { useLocale } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { useLazySection, LazyHistorySection } from '@/components/ui/lazy-history';

const UI = {
  en: {
    title: 'Diesel',
    subtitle: 'Read-only — stock, purchases, issuances and match flags for your site(s).',
    stockTitle: 'Stock in hand',
    stockSubtitle: 'Purchased − issued, per site',
    noSites: 'No site assigned to you yet',
    litresSuffix: 'L',
    flagsTitle: '🚩 Match flags',
    flagsSubtitle: "Issued and received litres didn't match (or one side is missing).",
    flagsEmpty: 'No diesel mismatches.',
    issuedLabel: 'Issued',
    receivedLabel: 'Received',
    litresMissing: '—',
    mismatchBadge: 'MISMATCH',
    purchasesTitle: 'Purchases',
    issuancesTitle: 'Issuances',
    purchasesEmpty: 'No purchases yet',
    issuancesEmpty: 'No issuances yet',
    statusPending: 'waiting for driver',
    statusConfirmed: 'confirmed',
    statusMismatch: 'mismatch',
    noteDash: '—',
  },
  hi: {
    title: 'डीज़ल',
    subtitle: 'केवल देखने के लिए — आपकी साइट(ओं) का स्टॉक, खरीद, आपूर्ति और मेल-न-खाना।',
    stockTitle: 'स्टॉक में डीज़ल',
    stockSubtitle: 'खरीदा − दिया, प्रति साइट',
    noSites: 'आपको अभी कोई साइट नहीं सौंपी गई',
    litresSuffix: 'लीटर',
    flagsTitle: '🚩 मेल-न-खाना',
    flagsSubtitle: 'दिया गया और मिला डीज़ल मेल नहीं खाया (या एक तरफ़ की एंट्री नहीं है)।',
    flagsEmpty: 'कोई डीज़ल मेल-न-खाना नहीं।',
    issuedLabel: 'दिया गया',
    receivedLabel: 'मिला',
    litresMissing: '—',
    mismatchBadge: 'मेल नहीं खाया',
    purchasesTitle: 'खरीद',
    issuancesTitle: 'आपूर्ति',
    purchasesEmpty: 'अभी तक कोई खरीद नहीं',
    issuancesEmpty: 'अभी तक कोई आपूर्ति नहीं',
    statusPending: 'ड्राइवर की एंट्री बाकी',
    statusConfirmed: 'मिलान हो गया',
    statusMismatch: 'बेमेल',
    noteDash: '—',
  },
} as const;

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

export function AccountantDieselScreen({ role = 'ACCOUNTANT' }: { role?: 'ACCOUNTANT' | 'SITE_MANAGER' } = {}) {
  const locale = useLocale();
  const ui = UI[locale];

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  // Eager — needed for the per-site stock total; the lazy history sections below reuse the
  // SAME query keys so revealing them never double-fetches (see diesel-screen.tsx precedent).
  const purchasesQ = useQuery({
    queryKey: ['fuel-stock', 'purchases'],
    queryFn: () => api<FuelStockPurchase[]>('GET', '/fuel-stock/purchases'),
  });
  const issuancesQ = useQuery({
    queryKey: ['fuel-stock', 'issuances'],
    queryFn: () => api<FuelIssuance[]>('GET', '/fuel-stock/issuances'),
  });
  const flagsQ = useQuery({
    queryKey: ['fuel-stock', 'flags'],
    queryFn: () => api<FuelMatchFlag[]>('GET', '/fuel-stock/flags'),
  });

  const sites = sitesQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  const multiSite = sites.length > 1;

  const regNoOf = (id: UUID) => vehicles.find((v) => v.id === id)?.regNo ?? ui.noteDash;
  const siteLabelOf = (id: UUID | null) => {
    const s = sites.find((x) => x.id === id);
    return s ? `${s.name} (${s.code})` : ui.noteDash;
  };

  const stockBySite = useMemo(() => {
    const purchased = new Map<UUID, number>();
    const issued = new Map<UUID, number>();
    for (const p of purchasesQ.data ?? []) purchased.set(p.siteId, (purchased.get(p.siteId) ?? 0) + p.litres);
    for (const i of issuancesQ.data ?? []) issued.set(i.siteId, (issued.get(i.siteId) ?? 0) + i.litres);
    return (sitesQ.data ?? []).map((s) => ({
      site: s,
      stock: (purchased.get(s.id) ?? 0) - (issued.get(s.id) ?? 0),
    }));
  }, [sitesQ.data, purchasesQ.data, issuancesQ.data]);

  const sortedPurchases = [...(purchasesQ.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 30);
  const sortedIssuances = [...(issuancesQ.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 30);
  const sortedFlags = [...(flagsQ.data ?? [])].sort((a, b) => b.businessDate.localeCompare(a.businessDate));

  return (
    <div className="grid gap-4" data-testid={role === 'ACCOUNTANT' ? 'accountant-diesel' : 'sm-fuel-monitor'}>
      <div>
        <h1 className="text-lg font-semibold">{ui.title}</h1>
        <p className="text-sm text-muted-foreground">{ui.subtitle}</p>
      </div>

      <Card data-testid="acc-diesel-stock-card">
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
            <ul className="divide-y">
              {stockBySite.map(({ site, stock }) => (
                <li
                  key={site.id}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  data-testid={`acc-diesel-stock-row-${site.id}`}
                >
                  <span className="min-w-0 truncate text-sm">
                    {site.name} <span className="text-muted-foreground">({site.code})</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {stock} {ui.litresSuffix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card data-testid="acc-diesel-flags-card">
        <CardHeader>
          <CardTitle>{ui.flagsTitle}</CardTitle>
          <CardDescription>{ui.flagsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {flagsQ.isPending ? (
            <LoadingState />
          ) : flagsQ.error ? (
            <ErrorState error={flagsQ.error} onRetry={() => void flagsQ.refetch()} />
          ) : sortedFlags.length === 0 ? (
            <EmptyState label={ui.flagsEmpty} />
          ) : (
            <ul className="divide-y">
              {sortedFlags.map((f, i) => (
                <li
                  key={`${f.vehicleId}-${f.businessDate}-${i}`}
                  className="grid gap-1 py-3 first:pt-0 last:pb-0"
                  data-testid={`acc-diesel-flag-${i}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {regNoOf(f.vehicleId)}
                      {multiSite ? ` · ${siteLabelOf(f.siteId)}` : ''}
                    </span>
                    <span className="inline-block w-fit shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                      {ui.mismatchBadge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatBusinessDateShort(f.businessDate)} · {ui.issuedLabel}{' '}
                    {f.issuedLitres === null ? ui.litresMissing : `${f.issuedLitres} ${ui.litresSuffix}`} / {ui.receivedLabel}{' '}
                    {f.receivedLitres === null ? ui.litresMissing : `${f.receivedLitres} ${ui.litresSuffix}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RecentPurchasesSection ui={ui} sorted={sortedPurchases} loading={purchasesQ.isPending} error={purchasesQ.error} onRetry={() => void purchasesQ.refetch()} refreshing={purchasesQ.isFetching} multiSite={multiSite} siteLabelOf={siteLabelOf} />
      <RecentIssuancesSection ui={ui} sorted={sortedIssuances} loading={issuancesQ.isPending} error={issuancesQ.error} onRetry={() => void issuancesQ.refetch()} refreshing={issuancesQ.isFetching} multiSite={multiSite} siteLabelOf={siteLabelOf} regNoOf={regNoOf} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lazy "recent" history sections — collapsed by default; the query below reuses
// the SAME queryKey as the eager stock fetch above, so opening this is an
// instant cache hit, never a second network round trip (diesel-screen.tsx idiom).
// ---------------------------------------------------------------------------

function RecentPurchasesSection({
  ui,
  sorted,
  loading,
  error,
  onRetry,
  refreshing,
  multiSite,
  siteLabelOf,
}: {
  ui: UiText;
  sorted: FuelStockPurchase[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  refreshing: boolean;
  multiSite: boolean;
  siteLabelOf: (id: UUID | null) => string;
}) {
  const { shown, show } = useLazySection();
  return (
    <Card size="sm" data-testid="acc-diesel-purchases-card">
      <CardContent>
        <LazyHistorySection
          title={ui.purchasesTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={onRetry}
          refreshing={refreshing}
          testId="acc-diesel-purchases-history"
        >
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={onRetry} />
          ) : sorted.length === 0 ? (
            <EmptyState label={ui.purchasesEmpty} />
          ) : (
            <ul className="divide-y" data-testid="acc-diesel-purchases-list">
              {sorted.map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  data-testid={`acc-diesel-purchase-${row.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {formatBusinessDateShort(row.businessDate)}
                      {multiSite ? ` · ${siteLabelOf(row.siteId)}` : ''}
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
              ))}
            </ul>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}

function RecentIssuancesSection({
  ui,
  sorted,
  loading,
  error,
  onRetry,
  refreshing,
  multiSite,
  siteLabelOf,
  regNoOf,
}: {
  ui: UiText;
  sorted: FuelIssuance[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  refreshing: boolean;
  multiSite: boolean;
  siteLabelOf: (id: UUID | null) => string;
  regNoOf: (id: UUID) => string;
}) {
  const { shown, show } = useLazySection();
  return (
    <Card size="sm" data-testid="acc-diesel-issuances-card">
      <CardContent>
        <LazyHistorySection
          title={ui.issuancesTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={onRetry}
          refreshing={refreshing}
          testId="acc-diesel-issuances-history"
        >
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={onRetry} />
          ) : sorted.length === 0 ? (
            <EmptyState label={ui.issuancesEmpty} />
          ) : (
            <ul className="divide-y" data-testid="acc-diesel-issuances-list">
              {sorted.map((row) => {
                const badge = statusBadge(row.status, ui);
                return (
                  <li
                    key={row.id}
                    className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    data-testid={`acc-diesel-issuance-${row.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatBusinessDateShort(row.businessDate)} · {regNoOf(row.vehicleId)}
                        {multiSite ? ` · ${siteLabelOf(row.siteId)}` : ''}
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
              })}
            </ul>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}
