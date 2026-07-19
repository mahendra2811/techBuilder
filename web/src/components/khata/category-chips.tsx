'use client';

import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type { LedgerRollupRow } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';

/** Per-category ₹ chips for one rollup row. `testIdPrefix` preserves each caller's existing test ids. */
export function CategoryChips({ byCategory, testIdPrefix }: { byCategory: LedgerRollupRow['byCategory']; testIdPrefix: string }) {
  const m = useMessages();
  // Frozen enum order keeps the chips stable regardless of server key order.
  const chips = EXPENSE_CATEGORIES.map((c) => ({ category: c, paise: byCategory[c] })).filter(
    (x): x is { category: (typeof EXPENSE_CATEGORIES)[number]; paise: number } => x.paise !== undefined && x.paise > 0,
  );
  if (chips.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-1">
      {chips.map(({ category, paise }) => (
        <span key={category} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" data-testid={`${testIdPrefix}-${category}`}>
          {m.EXPENSE_CATEGORY_LABELS[category]} {formatPaise(paise)}
        </span>
      ))}
    </p>
  );
}
