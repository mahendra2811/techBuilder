'use client';

import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { LocaleProvider } from '@/lib/i18n/locale-context';
import type { Locale } from '@/lib/i18n/locale';

/** Reference/lookup data — org-wide lists that change rarely (WO-6, wave 2). */
const REFERENCE_QUERY_KEYS = ['me', 'sites', 'vehicles', 'users', 'people', 'vendors'];
const REFERENCE_STALE_MS = 10 * 60_000; // 10 min

/** Windowed/filter-keyed aggregates + lists — toggling a window/filter swaps the
 * key, so `keepPreviousData` keeps the last result on screen instead of a
 * skeleton flash while the new one loads; a moderate staleTime avoids
 * refetching on every focus/mount without going stale for a whole session. */
const WINDOWED_QUERY_KEYS = [
  'owner-dashboard',
  'completeness',
  'insights',
  'records',
  'attendance',
  'cash-transfers',
  'ledger-rollup',
  'vendor-ledger',
  'wage-summary',
];
const WINDOWED_STALE_MS = 90_000; // 90s

function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
  for (const key of REFERENCE_QUERY_KEYS) client.setQueryDefaults([key], { staleTime: REFERENCE_STALE_MS });
  for (const key of WINDOWED_QUERY_KEYS) {
    client.setQueryDefaults([key], { staleTime: WINDOWED_STALE_MS, placeholderData: keepPreviousData });
  }
  return client;
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </QueryClientProvider>
  );
}
