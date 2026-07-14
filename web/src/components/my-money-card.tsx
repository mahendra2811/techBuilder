'use client';

/**
 * <MyMoneyCard /> — "मैंने लिया पैसा / Money I've taken" (CW-7). Mounted on the
 * Driver, Supervisor, and Site-Manager dashboards (Owner sees everyone's money
 * elsewhere, so this card is NOT mounted for the OWNER variant).
 *
 * GET /me/money returns ONLY the caller's own ACCOUNTANT-VERIFIED SALARY /
 * PERSONAL cash draws (WORK-tagged transfers are ordinary khata advances and
 * never appear here) — newest first, plus a running total.
 *
 * Collapsed by default (banking-app style, mirrors <KhataCard /> EXACTLY):
 * no network call until expanded — a "second priority" fetch that never
 * competes with a dashboard's base queries. A small refresh icon re-fetches
 * once expanded without collapsing the card.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { MoneyTag, MyMoney } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDate } from '@/lib/business-date';
import { useLocale } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, ErrorState, EmptyState } from '@/components/entry/states';

const UI = {
  en: {
    title: "Money I've taken",
    tapToShow: 'Tap to view',
    refresh: 'Refresh',
    collapse: 'Collapse',
    expand: 'Expand',
    totalLabel: 'Total',
    empty: 'No personal draws yet',
    fromLabel: 'From',
    verifiedHint: 'Accountant verified',
    tagSalary: 'Salary',
    tagPersonal: 'Personal',
  },
  hi: {
    title: 'मैंने लिया पैसा',
    tapToShow: 'देखने के लिए दबाएँ',
    refresh: 'रीफ़्रेश करें',
    collapse: 'छोटा करें',
    expand: 'बड़ा करें',
    totalLabel: 'कुल',
    empty: 'अभी तक कोई निजी रक़म नहीं',
    fromLabel: 'किससे',
    verifiedHint: 'अकाउंटेंट द्वारा सत्यापित',
    tagSalary: 'वेतन',
    tagPersonal: 'निजी',
  },
} as const;

function TagBadge({ tag, ui }: { tag: MoneyTag; ui: { tagSalary: string; tagPersonal: string } }) {
  if (tag !== 'SALARY' && tag !== 'PERSONAL') return null;
  return (
    <span
      data-testid={`my-money-tag-${tag}`}
      className={cn(
        'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tag === 'SALARY' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
      )}
    >
      {tag === 'SALARY' ? ui.tagSalary : ui.tagPersonal}
    </span>
  );
}

export function MyMoneyCard() {
  const locale = useLocale();
  const ui = UI[locale];
  const [expanded, setExpanded] = useState(false);

  const moneyQ = useQuery({
    queryKey: ['my-money'],
    queryFn: () => api<MyMoney>('GET', '/me/money'),
    enabled: expanded,
  });

  const entries = moneyQ.data?.entries ?? [];

  return (
    <Card data-testid="my-money-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{ui.title}</CardTitle>
        <div className="flex items-center gap-1">
          {expanded && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="my-money-refresh"
              aria-label={ui.refresh}
              disabled={moneyQ.isFetching}
              onClick={() => void moneyQ.refetch()}
            >
              <RefreshCw className={cn('size-4', moneyQ.isFetching && 'animate-spin')} aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="my-money-toggle"
            aria-label={expanded ? ui.collapse : ui.expand}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-16 content-start gap-3">
        {!expanded ? (
          <p className="text-xs text-muted-foreground">{ui.tapToShow}</p>
        ) : moneyQ.isPending ? (
          <LoadingState />
        ) : moneyQ.error ? (
          <ErrorState error={moneyQ.error} onRetry={() => void moneyQ.refetch()} />
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">{ui.totalLabel}</p>
              <p className="text-2xl font-semibold tabular-nums" data-testid="my-money-total">
                {formatPaise(moneyQ.data?.totalPaise ?? 0)}
              </p>
            </div>
            {entries.length === 0 ? (
              <EmptyState label={ui.empty} />
            ) : (
              <ShowMore
                items={entries}
                initial={7}
                as="ul"
                className="divide-y"
                testIdPrefix="my-money"
                renderItem={(e) => (
                  <li key={e.id} className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`my-money-row-${e.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium">{formatBusinessDate(e.businessDate)}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(e.amountPaise)}</p>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <TagBadge tag={e.tag} ui={ui} />
                      <span className="min-w-0 truncate">
                        {ui.fromLabel} {e.fromName}
                      </span>
                      {e.note && <span className="min-w-0 truncate">· {e.note}</span>}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3" aria-hidden="true" />
                      {ui.verifiedHint}
                    </p>
                  </li>
                )}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
