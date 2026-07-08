'use client';

/**
 * <KhataCard /> — compact "my cash khata" mounted on ALL FIVE role dashboards
 * (WO-9-UI). GET /me/balance works for EVERY role: one big BALANCE figure
 * (cash the user still holds; balance = received − given − approved CASH
 * expenses, negative rendered red with a leading minus) over a small
 * received / spent / given breakdown, sized for a construction worker's phone.
 *
 * A khata card must never break a dashboard: any query error renders nothing.
 */
import { useQuery } from '@tanstack/react-query';
import type { MyBalance } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, formatSignedPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/entry/states';

export function KhataCard() {
  const m = useMessages();
  const balanceQ = useQuery({
    queryKey: ['me', 'balance'],
    queryFn: () => api<MyBalance>('GET', '/me/balance'),
  });

  if (balanceQ.error) return null;

  const b = balanceQ.data;
  return (
    <Card data-testid="khata-card">
      <CardHeader>
        <CardTitle>{m.LEDGER_UI.cardTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid min-h-16 content-start gap-3">
        {!b ? (
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
