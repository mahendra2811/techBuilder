'use client';

/**
 * Offset-paged "load more" helper for inbox-style lists that are genuinely
 * unbounded server-side (unlike `<ShowMore />`, which just staggers the
 * render of data that's already fully in memory — see its own doc comment).
 * Pair with an endpoint that accepts `?limit=&offset=` (e.g. `GET /complaints`).
 *
 * Plain state hook, NOT React Query — `useLoadMore` owns its own `items`
 * array and appends pages into it, which doesn't fit React Query's
 * cache-keyed-by-queryKey model. Usage:
 * ```tsx
 * function MyInbox() {
 *   const { items, loadFirst, loadMore, hasMore, loading, error, reset } = useLoadMore<Complaint>({
 *     pageSize: 20,
 *     fetchPage: (offset, limit) => api<Complaint[]>('GET', `/complaints?limit=${limit}&offset=${offset}`),
 *   });
 *   useEffect(() => { void loadFirst(); }, [loadFirst]);
 *   return (
 *     <>
 *       {items.map((c) => <Row key={c.id} item={c} />)}
 *       {error && <ErrorState error={error} onRetry={loadFirst} />}
 *       {hasMore && <LoadMoreButton onClick={loadMore} loading={loading} />}
 *     </>
 *   );
 * }
 * ```
 */
import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';

const UI = {
  en: { loadMore: 'Load more' },
  hi: { loadMore: 'और देखें' },
} as const;

export function useLoadMore<T>({
  pageSize,
  fetchPage,
}: {
  pageSize: number;
  fetchPage: (offset: number, limit: number) => Promise<T[]>;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchAt = useCallback(
    async (offset: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchPage(offset, pageSize);
        setItems((prev) => (replace ? page : [...prev, ...page]));
        setHasMore(page.length === pageSize);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, pageSize],
  );

  /** (Re)start from offset 0, replacing `items`. */
  const loadFirst = useCallback(() => fetchAt(0, true), [fetchAt]);
  /** Fetch the next page and append it to `items`. */
  const loadMore = useCallback(() => fetchAt(items.length, false), [fetchAt, items.length]);
  /** Clear all state back to the initial (unfetched) shape — does not refetch. */
  const reset = useCallback(() => {
    setItems([]);
    setHasMore(true);
    setError(null);
  }, []);

  return { items, loadFirst, loadMore, hasMore, loading, error, reset };
}

export function LoadMoreButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading?: boolean;
  /** @default 'Load more' / 'और देखें' (locale-aware) */
  label?: string;
}) {
  const locale = useLocale();
  const text = label ?? UI[locale].loadMore;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit"
      data-testid="load-more-button"
      disabled={loading}
      onClick={onClick}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {text}
    </Button>
  );
}
