'use client';

/**
 * WO-11/WO-12 shared damage-lifecycle timeline: raised → resolved (SM's note) →
 * closed (driver's optional note). Purely presentational — role-specific actions
 * (SM's inline resolve form, driver's closing-remark button) are injected per-issue
 * via `renderExtra`, so this one component is reused on both the driver surface
 * (own raised issues) and the vehicle-detail screen (Owner + SM, all damages).
 */
import type { Issue } from '@techbuilder/contracts';
import { formatBusinessDateShort } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { cn } from '@/lib/utils';

const SEVERITY_CLASS: Record<Issue['severity'], string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  HIGH: 'bg-destructive/10 text-destructive',
};

const STATUS_CLASS: Record<Issue['status'], string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

export function DamageTimeline({
  issues,
  isLoading,
  error,
  onRetry,
  testId = 'damage-timeline',
  renderExtra,
}: {
  issues: Issue[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  testId?: string;
  /** Per-issue action slot (SM resolve form / driver close button) — kept out of this component
   *  so it stays free of any one role's mutation wiring. */
  renderExtra?: (issue: Issue) => React.ReactNode;
}) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!issues || issues.length === 0) return <EmptyState label={w.damageHistoryEmpty} />;

  const sorted = [...issues].sort(
    (a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <ul className="grid gap-3" data-testid={testId}>
      {sorted.map((issue) => (
        <li
          key={issue.id}
          className="grid gap-2 rounded-lg border border-input p-3"
          data-testid={`${testId}-${issue.id}`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                SEVERITY_CLASS[issue.severity],
              )}
              data-testid={`${testId}-${issue.id}-severity`}
            >
              {w.SEVERITY_LABELS[issue.severity]}
            </span>
            <span
              className={cn(
                'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                STATUS_CLASS[issue.status],
              )}
              data-testid={`${testId}-${issue.id}-status`}
            >
              {w.STATUS_LABELS[issue.status]}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatBusinessDateShort(issue.businessDate)}
            </span>
          </div>

          <p className="text-sm">{issue.description}</p>

          <div className="grid gap-1.5 border-l-2 border-muted pl-3">
            <p className="text-xs text-muted-foreground">{w.timelineRaised}</p>
            {issue.status === 'RESOLVED' && (
              <div className="grid gap-0.5">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{w.timelineResolved}</p>
                {issue.resolutionNote && <p className="text-xs text-muted-foreground">{issue.resolutionNote}</p>}
              </div>
            )}
            {issue.closingNote && (
              <div className="grid gap-0.5">
                <p className="text-xs font-medium">{w.timelineClosed}</p>
                <p className="text-xs text-muted-foreground">{issue.closingNote}</p>
              </div>
            )}
          </div>

          {renderExtra?.(issue)}
        </li>
      ))}
    </ul>
  );
}
