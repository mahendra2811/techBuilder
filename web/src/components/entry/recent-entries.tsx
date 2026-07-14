'use client';

/** Read-only "last 7 days" context list rendered under each entry form. */
import { useMessages } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, EmptyState, ErrorState } from './states';

export interface RecentRow {
  id: string;
  /** Left, bold-ish — e.g. category or reg no. */
  primary: string;
  /** Right — e.g. ₹ amount or litres. */
  secondary?: string;
  /** Muted second line — e.g. date / note snippet. */
  tertiary?: string;
  /** Round 2 (CW-5): optional small status pill under `secondary` (e.g. diesel match state). */
  badge?: { label: string; tone: 'success' | 'warning' | 'error' };
}

export function RecentEntries({
  rows,
  isLoading,
  error,
  onRetry,
  testId,
}: {
  rows: RecentRow[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  testId: string;
}) {
  const m = useMessages();
  return (
    <Card size="sm" data-testid={testId}>
      <CardHeader>
        <CardTitle>{m.ENTRY_UI.recentTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState label={m.ENTRY_UI.recentEmpty} />
        ) : (
          <ShowMore
            items={rows}
            initial={5}
            as="ul"
            className="divide-y"
            testIdPrefix={`${testId}-recent`}
            renderItem={(r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.primary}</p>
                  {r.tertiary && <p className="truncate text-xs text-muted-foreground">{r.tertiary}</p>}
                </div>
                {(r.secondary || r.badge) && (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {r.secondary && <span className="text-sm tabular-nums">{r.secondary}</span>}
                    {r.badge && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[11px] font-medium',
                          r.badge.tone === 'success' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                          r.badge.tone === 'warning' && 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
                          r.badge.tone === 'error' && 'bg-destructive/10 text-destructive',
                        )}
                      >
                        {r.badge.label}
                      </span>
                    )}
                  </div>
                )}
              </li>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
