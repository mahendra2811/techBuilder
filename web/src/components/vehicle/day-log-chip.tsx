'use client';

/**
 * Shared traffic-light "day-log" status chip — used by the driver dashboard's
 * compact vehicle status strip (links to /driver/meter) and the meter page's
 * own yesterday-night informational chip (display-only, no href). Split out
 * of driver-dashboard-screen.tsx (frozen.10, DRV-1/DRV-5) when the Morning/
 * Evening forms moved to their own page — both screens render the identical
 * chip look, so the tone classes + markup live here once.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type DayLogTone = 'success' | 'warning' | 'warningMuted' | 'error';

const DAY_LOG_TONE_CLASSES: Record<DayLogTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  warningMuted: 'border-input bg-muted/40 text-muted-foreground',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const DAY_LOG_DOT_CLASSES: Record<DayLogTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  warningMuted: 'bg-amber-500/40',
  error: 'bg-destructive',
};

/** One traffic-light day-log chip. Renders as a `next/link` when `href` is
 * given (dashboard strip — every chip now opens /driver/meter); otherwise a
 * plain, non-interactive display chip (meter page's yesterday-night chip). */
export function DayLogChip({
  label,
  tone,
  statusLabel,
  href,
  testId,
}: {
  label: string;
  tone: DayLogTone;
  statusLabel: string;
  href?: string;
  testId: string;
}) {
  const classes = cn(
    'grid gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
    DAY_LOG_TONE_CLASSES[tone],
    href ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
  );
  const content = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-medium leading-tight">
        <span className={cn('size-1.5 shrink-0 rounded-full', DAY_LOG_DOT_CLASSES[tone])} aria-hidden="true" />
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} data-testid={testId} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <div data-testid={testId} className={classes}>
      {content}
    </div>
  );
}
