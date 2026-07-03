'use client';

/** Read-only "last 7 days" context list rendered under each entry form. */
import { ENTRY_UI } from '@/lib/messages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState } from './states';

export interface RecentRow {
  id: string;
  /** Left, bold-ish — e.g. category or reg no. */
  primary: string;
  /** Right — e.g. ₹ amount or litres. */
  secondary?: string;
  /** Muted second line — e.g. date / note snippet. */
  tertiary?: string;
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
  return (
    <Card size="sm" data-testid={testId}>
      <CardHeader>
        <CardTitle>{ENTRY_UI.recentTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState label={ENTRY_UI.recentEmpty} />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.primary}</p>
                  {r.tertiary && <p className="truncate text-xs text-muted-foreground">{r.tertiary}</p>}
                </div>
                {r.secondary && <span className="shrink-0 text-sm tabular-nums">{r.secondary}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
