'use client';

/**
 * <KhataCard /> — compact "my cash khata" mounted on ALL FIVE role dashboards
 * (WO-9-UI). GET /me/balance works for EVERY role: one big BALANCE figure
 * (cash the user still holds; balance = received − given − approved CASH
 * expenses, negative rendered red with a leading minus) over a small
 * received / spent / given breakdown, sized for a construction worker's phone.
 *
 * WO-1 (wave 2): banking-app style — hidden by default, no network call until
 * the eye is tapped (a "second priority" fetch that never competes with a
 * dashboard's base queries). Once revealed, a small refresh icon re-fetches
 * without hiding the current figures (loader only on the icon).
 *
 * A khata card must never break a dashboard: any query error renders nothing.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { MyBalance } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, formatSignedPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/entry/states';

export function KhataCard() {
  const m = useMessages();
  const [revealed, setRevealed] = useState(false);
  const balanceQ = useQuery({
    queryKey: ['me', 'balance'],
    queryFn: () => api<MyBalance>('GET', '/me/balance'),
    enabled: revealed,
  });

  if (revealed && balanceQ.error) return null;

  const b = balanceQ.data;
  const masked = m.LEDGER_UI.hiddenPlaceholder;

  return (
    <Card data-testid="khata-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{m.LEDGER_UI.cardTitle}</CardTitle>
        <div className="flex items-center gap-1">
          {revealed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-testid="khata-refresh"
              aria-label={m.LEDGER_UI.refreshAmounts}
              disabled={balanceQ.isFetching}
              onClick={() => void balanceQ.refetch()}
            >
              <RefreshCw className={cn('size-4', balanceQ.isFetching && 'animate-spin')} aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="khata-toggle-reveal"
            aria-label={revealed ? m.LEDGER_UI.hideAmounts : m.LEDGER_UI.showAmounts}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-16 content-start gap-3">
        {!revealed ? (
          <div>
            <p className="text-xs text-muted-foreground">{m.LEDGER_UI.balanceLabel}</p>
            <p className="text-2xl font-semibold tabular-nums text-muted-foreground" data-testid="khata-balance-masked">
              {masked}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{m.LEDGER_UI.tapToShow}</p>
          </div>
        ) : !b ? (
          <LoadingState />
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">{m.LEDGER_UI.balanceLabel}</p>
              <p
                className={cn('text-2xl font-semibold tabular-nums', b.balancePaise < 0 && 'text-destructive')}
                data-testid="khata-balance"
              >
                {formatSignedPaise(b.balancePaise)}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{m.LEDGER_UI.receivedLabel}</p>
                <p className="text-sm font-medium tabular-nums" data-testid="khata-received">
                  {formatPaise(b.receivedPaise)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{m.LEDGER_UI.spentLabel}</p>
                <p className="text-sm font-medium tabular-nums" data-testid="khata-spent">
                  {formatPaise(b.spentPaise)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{m.LEDGER_UI.givenLabel}</p>
                <p className="text-sm font-medium tabular-nums" data-testid="khata-given">
                  {formatPaise(b.givenPaise)}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
