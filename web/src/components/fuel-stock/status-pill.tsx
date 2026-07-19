'use client';

import { cn } from '@/lib/utils';
import type { StatusTone } from './status-badge';

/** The pill wrapper for a materialTxnStatusBadge() result — shared by diesel-screen.tsx and accountant-diesel-screen.tsx. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'success' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
        tone === 'error' && 'bg-destructive/10 text-destructive',
      )}
    >
      {children}
    </span>
  );
}
