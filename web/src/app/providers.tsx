'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { LocaleProvider } from '@/lib/i18n/locale-context';
import type { Locale } from '@/lib/i18n/locale';

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </QueryClientProvider>
  );
}
