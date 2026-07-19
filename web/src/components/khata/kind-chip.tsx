'use client';

import type { CashTransferKind } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';

/** GIVE/RETURN pill shown on a transfer row. `testIdPrefix` preserves each caller's existing test ids. */
export function KindChip({ kind, testIdPrefix }: { kind: CashTransferKind; testIdPrefix: string }) {
  const m = useMessages();
  return (
    <span
      data-testid={`${testIdPrefix}-${kind}`}
      className={cn(
        'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        kind === 'GIVE' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      )}
    >
      {kind === 'GIVE' ? m.LEDGER_UI.kindChipGive : m.LEDGER_UI.kindChipReturn}
    </span>
  );
}
