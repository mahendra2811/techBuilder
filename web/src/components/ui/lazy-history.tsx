'use client';

/**
 * "Form first, history on demand" section — banking-app style (same idea as
 * `<KhataCard />`'s eye-toggle): a form/action stays the focus of the screen;
 * its history list is collapsed behind a "Show history" tap so it never
 * competes with the primary content's first paint or network calls.
 *
 * IMPORTANT — the intended usage gates the caller's React Query `enabled` on
 * the same `shown` flag, via `useLazySection()`:
 * ```tsx
 * function MySection() {
 *   const { shown, show } = useLazySection();
 *   const historyQ = useQuery({
 *     queryKey: ['my-history'],
 *     queryFn: () => api<MyRow[]>('GET', '/my-history'),
 *     enabled: shown,
 *   });
 *   return (
 *     <LazyHistorySection
 *       title="History"
 *       testId="my-history"
 *       shown={shown}
 *       onFirstShow={show}
 *       onRefresh={() => void historyQ.refetch()}
 *       refreshing={historyQ.isFetching}
 *     >
 *       {historyQ.isPending ? <LoadingState /> : ...render historyQ.data...}
 *     </LazyHistorySection>
 *   );
 * }
 * ```
 * Callers who don't need query-gating can omit `shown`/`onFirstShow` entirely
 * — the section then just tracks its own open/closed state internally.
 */
import { useState } from 'react';
import { useQuery, type QueryFunction, type QueryKey } from '@tanstack/react-query';
import { History, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { QueryBoundary } from '@/components/ui/query-boundary';

const UI = {
  en: { showHistory: 'Show history', refresh: 'Refresh' },
  hi: { showHistory: 'इतिहास देखें', refresh: 'रिफ्रेश करें' },
} as const;

/** Standalone state hook for callers who need `shown` in their own scope (e.g. a `useQuery enabled`). */
export function useLazySection() {
  const [shown, setShown] = useState(false);
  return { shown, show: () => setShown(true) };
}

/**
 * The whole "lazy history" idiom in one component: reveal state + a `shown`-
 * gated query + refresh button + the loading/error/empty ladder. Replaces the
 * useLazySection + useQuery({enabled: shown}) + LazyHistorySection +
 * QueryBoundary stack every history section was assembling by hand. Reusing an
 * eager query's key elsewhere on the page keeps the reveal an instant cache
 * hit (the repo's established idiom). `children` renders only with data.
 */
export function LazyQuerySection<T>({
  title,
  testId,
  queryKey,
  queryFn,
  emptyLabel,
  isEmpty,
  children,
}: {
  title: string;
  testId: string;
  queryKey: QueryKey;
  queryFn: QueryFunction<T>;
  emptyLabel?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  const { shown, show } = useLazySection();
  const q = useQuery({ queryKey, queryFn, enabled: shown });
  return (
    <LazyHistorySection
      title={title}
      shown={shown}
      onFirstShow={show}
      onRefresh={() => void q.refetch()}
      refreshing={q.isFetching}
      testId={testId}
    >
      <QueryBoundary query={q} emptyLabel={emptyLabel} isEmpty={isEmpty}>
        {children}
      </QueryBoundary>
    </LazyHistorySection>
  );
}

export function LazyHistorySection({
  title,
  shown: shownProp,
  onFirstShow,
  onRefresh,
  refreshing,
  testId = 'lazy-history',
  children,
}: {
  title: string;
  /** Controlled-optional. Pass the `shown` from `useLazySection()` to drive this externally; omit for internal state. */
  shown?: boolean;
  /** Called once, on the tap that first reveals the section (wire to `show` from `useLazySection()` when controlled). */
  onFirstShow?: () => void;
  /** Refresh icon button in the title row, shown only once revealed. */
  onRefresh?: () => void;
  refreshing?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const ui = UI[locale];
  const [internalShown, setInternalShown] = useState(false);
  const controlled = shownProp !== undefined;
  const shown = controlled ? shownProp : internalShown;

  const reveal = () => {
    if (!controlled) setInternalShown(true);
    onFirstShow?.();
  };

  return (
    <div className="grid gap-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {shown && onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid={`${testId}-refresh`}
            aria-label={ui.refresh}
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden="true" />
          </Button>
        )}
      </div>
      {!shown ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          data-testid={`${testId}-show`}
          onClick={reveal}
        >
          <History className="size-4" aria-hidden="true" />
          {ui.showHistory}
        </Button>
      ) : (
        children
      )}
    </div>
  );
}
