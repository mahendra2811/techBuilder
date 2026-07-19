'use client';

import type { LedgerRollupRow } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, formatSignedPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { CategoryChips } from './category-chips';

/** The "who holds what" row list — shared by khata-screen's lazy sub-page and ledger-screen's eager section. */
export function RollupRows({ rows, testIdPrefix }: { rows: LedgerRollupRow[]; testIdPrefix: string }) {
  const m = useMessages();
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.userId} className="grid gap-2 py-3 first:pt-0 last:pb-0" data-testid={`${testIdPrefix}-row-${row.userId}`}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">
              {row.name} <span className="text-xs font-normal text-muted-foreground">{m.ROLE_LABELS[row.role]}</span>
            </p>
            <p
              className={cn('shrink-0 text-sm font-bold tabular-nums', row.balancePaise < 0 && 'text-destructive')}
              data-testid={`${testIdPrefix}-balance-${row.userId}`}
            >
              {formatSignedPaise(row.balancePaise)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {m.LEDGER_UI.rollupReceived} {formatPaise(row.receivedPaise)} · {m.LEDGER_UI.rollupGiven} {formatPaise(row.givenPaise)} ·{' '}
            {m.LEDGER_UI.rollupSpent} {formatPaise(row.spentPaise)}
          </p>
          <CategoryChips byCategory={row.byCategory} testIdPrefix={`${testIdPrefix}-cat`} />
        </li>
      ))}
    </ul>
  );
}
