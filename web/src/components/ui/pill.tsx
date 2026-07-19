import { cn } from '@/lib/utils';

export type PillTone = 'success' | 'warning' | 'error' | 'neutral' | 'primary';

const TONE_CLASSES: Record<PillTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
  error: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
};

/**
 * The one status/tag chip — the small rounded `text-[11px]` badge every list
 * row uses (request status, diesel match, verify tick, active/inactive, GIVE/
 * RETURN kind…). Pick a `tone`; domain components (KindChip, StatusBadge…)
 * wrap this rather than hand-rolling the span.
 */
export function Pill({
  tone,
  testId,
  className,
  children,
}: {
  tone: PillTone;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      className={cn('inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', TONE_CLASSES[tone], className)}
    >
      {children}
    </span>
  );
}
