'use client';

/**
 * Completeness visuals — ALWAYS color + text (never color alone).
 * Badge = one day's state as a labelled pill; Dots = a compact last-N-days row
 * where each dot carries its date + state as an accessible label/tooltip.
 * Days with no completeness row (weekly off / site holiday) render as a hollow
 * muted dot labelled "Off day / no data".
 */
import type { BusinessDate, Completeness, CompletenessState } from '@techbuilder/contracts';
import { eachDate, formatBusinessDateShort } from '@/lib/business-date';
import { COMPLETENESS_STATE_LABELS, OWNER_UI } from '@/lib/messages';
import { cn } from '@/lib/utils';

const BADGE_CLASS: Record<CompletenessState, string> = {
  COMPLETE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  PARTIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  MISSING: 'bg-destructive/10 text-destructive',
};

const DOT_CLASS: Record<CompletenessState, string> = {
  COMPLETE: 'bg-emerald-500',
  PARTIAL: 'bg-amber-500',
  MISSING: 'bg-destructive',
};

/** Labelled state pill; `state === undefined` → muted "No data". */
export function CompletenessBadge({ state, testId }: { state: CompletenessState | undefined; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-block shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        state ? BADGE_CLASS[state] : 'bg-muted text-muted-foreground',
      )}
    >
      {state ? COMPLETENESS_STATE_LABELS[state] : OWNER_UI.completenessNoData}
    </span>
  );
}

/** Compact per-day dot row for one site over [from..to] (oldest → newest). */
export function CompletenessDots({
  rows,
  siteId,
  from,
  to,
}: {
  rows: Completeness[];
  siteId: string;
  from: BusinessDate;
  to: BusinessDate;
}) {
  const byDate = new Map(rows.filter((r) => r.scopeId === siteId).map((r) => [r.businessDate, r.state]));
  return (
    <span className="flex items-center gap-1" data-testid={`completeness-dots-${siteId}`}>
      {eachDate(from, to).map((d) => {
        const state = byDate.get(d);
        const label = `${formatBusinessDateShort(d)}: ${state ? COMPLETENESS_STATE_LABELS[state] : OWNER_UI.offDay}`;
        return (
          <span
            key={d}
            role="img"
            aria-label={label}
            title={label}
            className={cn('size-2 rounded-full', state ? DOT_CLASS[state] : 'border border-muted-foreground/40')}
          />
        );
      })}
    </span>
  );
}
