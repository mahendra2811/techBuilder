'use client';

/** WO-13 shared period-totals header — used by the site insights screen (period mode)
 *  and the per-person drill-down. */
import type { ExpenseCategory, PeriodTotals } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

export function PeriodSummary({ totals }: { totals: PeriodTotals }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  const categoryEntries = Object.entries(totals.byCategory) as Array<[ExpenseCategory, number]>;

  return (
    <div className="grid gap-3" data-testid="insights-period-totals">
      <div>
        <p className="text-xs text-muted-foreground">{i.periodTotalSpend}</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid="insights-period-total-expense">
          {formatPaise(totals.totalExpensePaise)}
        </p>
      </div>

      {categoryEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categoryEntries.map(([cat, amt]) => (
            <span key={cat} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {m.EXPENSE_CATEGORY_LABELS[cat]}: {formatPaise(amt ?? 0)}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          {i.periodProgressLabel}: <strong className="tabular-nums">{totals.progressDays}</strong>
        </span>
        <span className={cn(totals.noProgressDays > 0 && 'font-medium text-destructive')}>
          {i.periodNoProgressLabel}: <strong className="tabular-nums">{totals.noProgressDays}</strong>
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {m.APPROVAL_STATUS_LABELS.PENDING}: <strong className="tabular-nums">{totals.requestsPending}</strong>
        </span>
        <span>
          {m.APPROVAL_STATUS_LABELS.APPROVED}: <strong className="tabular-nums">{totals.requestsApproved}</strong>
        </span>
        <span>
          {m.APPROVAL_STATUS_LABELS.REJECTED}: <strong className="tabular-nums">{totals.requestsRejected}</strong>
        </span>
      </div>
    </div>
  );
}
