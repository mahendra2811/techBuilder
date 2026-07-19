'use client';

import type { CashTransferKind } from '@techbuilder/contracts';
import { useMessages } from '@/lib/i18n/locale-context';
import { Pill } from '@/components/ui/pill';

/** GIVE/RETURN pill shown on a transfer row. `testIdPrefix` preserves each caller's existing test ids. */
export function KindChip({ kind, testIdPrefix }: { kind: CashTransferKind; testIdPrefix: string }) {
  const m = useMessages();
  return (
    <Pill tone={kind === 'GIVE' ? 'primary' : 'success'} testId={`${testIdPrefix}-${kind}`}>
      {kind === 'GIVE' ? m.LEDGER_UI.kindChipGive : m.LEDGER_UI.kindChipReturn}
    </Pill>
  );
}
