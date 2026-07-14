'use client';

/**
 * <FuelFlagsCard /> — Round 2 (CW-5): the diesel double-check red-flag list,
 * mounted on BOTH the OWNER and SITE_MANAGER dashboards (the ACCOUNTANT sees
 * his own copy via the accountant work queue elsewhere — this component is
 * not mounted there). `GET /fuel-stock/flags` only ever returns rows the
 * backend has already flagged — a missing side or a litres mismatch on a
 * (vehicle, businessDate) pair — so a CONFIRMED (equal) pairing never shows
 * up here: an empty list IS the good outcome, not a loading gap.
 *
 * Collapsed by default, following <KhataCard />'s "second priority" pattern:
 * zero network call until the eye is tapped, so this card never competes
 * with a dashboard's base queries. Window: trailing 30 days (a flag can take
 * a day to settle after the org's EOD cutoff; 30d matches the app's other
 * rollup window).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { FuelMatchFlag, UUID, Vehicle } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { useLocale } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState } from '@/components/entry/states';

const UI = {
  en: {
    title: 'Diesel check',
    hideAria: 'Hide diesel check',
    showAria: 'Show diesel check',
    refreshAria: 'Refresh',
    allMatched: 'All matched ✓',
    tapToShow: 'Tap to check for diesel mismatches',
    issuedLabel: 'issued',
    receivedLabel: 'received',
    litresSuffix: 'L',
    statusMismatch: 'mismatch',
    statusPending: 'one side missing',
  },
  hi: {
    title: 'डीज़ल जाँच',
    hideAria: 'डीज़ल जाँच छुपाएँ',
    showAria: 'डीज़ल जाँच दिखाएँ',
    refreshAria: 'रीफ़्रेश करें',
    allMatched: 'सब मिलान सही ✓',
    tapToShow: 'डीज़ल के मिलान की जाँच के लिए टैप करें',
    issuedLabel: 'दिया',
    receivedLabel: 'मिला',
    litresSuffix: 'लीटर',
    statusMismatch: 'बेमेल',
    statusPending: 'एक तरफ़ बाकी',
  },
} as const;

export function FuelFlagsCard() {
  const locale = useLocale();
  const ui = UI[locale];
  const [revealed, setRevealed] = useState(false);
  const today = useMemo(() => todayKolkata(), []);
  const from = useMemo(() => addDays(today, -29), [today]);

  const flagsQ = useQuery({
    queryKey: ['fuel-flags', from, today],
    queryFn: () => api<FuelMatchFlag[]>('GET', `/fuel-stock/flags?from=${from}&to=${today}`),
    enabled: revealed,
  });
  const vehiclesQ = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api<Vehicle[]>('GET', '/vehicles'),
    enabled: revealed,
  });

  // A khata-card-style card must never break a dashboard: any query error renders nothing.
  if (revealed && flagsQ.error) return null;

  const regNoOf = (id: UUID) => vehiclesQ.data?.find((v) => v.id === id)?.regNo ?? '—';
  const flags = flagsQ.data ?? [];

  return (
    <Card data-testid="fuel-flags-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>🚩 {ui.title}</CardTitle>
        <div className="flex items-center gap-1">
          {revealed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="fuel-flags-refresh"
              aria-label={ui.refreshAria}
              disabled={flagsQ.isFetching}
              onClick={() => void flagsQ.refetch()}
            >
              <RefreshCw className={cn('size-4', flagsQ.isFetching && 'animate-spin')} aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="fuel-flags-toggle"
            aria-label={revealed ? ui.hideAria : ui.showAria}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-16 content-start gap-3">
        {!revealed ? (
          <p className="text-xs text-muted-foreground" data-testid="fuel-flags-hint">
            {ui.tapToShow}
          </p>
        ) : flagsQ.isPending || vehiclesQ.isPending ? (
          <LoadingState />
        ) : flags.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="fuel-flags-empty">
            {ui.allMatched}
          </p>
        ) : (
          <ShowMore
            items={flags}
            initial={7}
            as="ul"
            className="divide-y"
            testIdPrefix="fuel-flags"
            renderItem={(f, idx) => {
              const isMismatch = f.status === 'MISMATCH';
              return (
                <li
                  key={`${f.vehicleId}-${f.businessDate}`}
                  className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  data-testid={`fuel-flag-${idx}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {formatBusinessDateShort(f.businessDate)} · {regNoOf(f.vehicleId)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ui.issuedLabel} {f.issuedLitres ?? '—'} {ui.litresSuffix} / {ui.receivedLabel}{' '}
                      {f.receivedLitres ?? '—'} {ui.litresSuffix}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                      isMismatch ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
                    )}
                  >
                    {isMismatch ? `🚩 ${ui.statusMismatch}` : ui.statusPending}
                  </span>
                </li>
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
