'use client';

import type { CashTransfer, UUID } from '@techbuilder/contracts';
import { formatPaise } from '@/lib/money';
import { TagBadge } from '@/components/my-money-card';
import { KindChip } from './kind-chip';

/** One give/receive/salary history row — shared by khata-screen's slice history and ledger-screen's transfers history. */
export function TransferRow({
  t,
  userName,
  rowTestIdPrefix,
  kindChipTestIdPrefix,
  tagLabels,
}: {
  t: CashTransfer;
  userName: (id: UUID) => string;
  rowTestIdPrefix: string;
  kindChipTestIdPrefix: string;
  tagLabels: { tagSalary: string; tagPersonal: string };
}) {
  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`${rowTestIdPrefix}-${t.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {userName(t.fromUserId)} → {userName(t.toUserId)}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <KindChip kind={t.kind} testIdPrefix={kindChipTestIdPrefix} />
        <TagBadge tag={t.tag} ui={tagLabels} />
        <span>{t.businessDate}</span>
        {t.note && <span className="min-w-0 truncate">· {t.note}</span>}
      </p>
    </li>
  );
}
