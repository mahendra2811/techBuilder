'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';

/**
 * The standard loading → error(+retry) → empty → content ladder around one
 * TanStack query, extracted from the `q.isPending ? <LoadingState/> : q.error
 * ? <ErrorState/> : … ` chain every list card used to hand-roll.
 *
 * - `children` is a render prop — it only runs once data is present.
 * - `emptyLabel` turns on the EmptyState rung; by default "empty" means an
 *   empty array (or null/undefined data). Pass `isEmpty` to override.
 * - Multi-query sections (several queries feeding one block) keep their
 *   hand-written chains — this wrapper is deliberately single-query.
 */
export function QueryBoundary<T>({
  query,
  emptyLabel,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>;
  emptyLabel?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  const empty = isEmpty ? isEmpty(data) : data == null || (Array.isArray(data) && data.length === 0);
  if (empty && emptyLabel !== undefined) return <EmptyState label={emptyLabel} />;
  return <>{children(data)}</>;
}
