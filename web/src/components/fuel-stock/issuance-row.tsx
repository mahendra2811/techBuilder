'use client';

import type { FuelIssuance } from '@techbuilder/contracts';
import { formatBusinessDateShort } from '@/lib/business-date';
import { Pill } from '@/components/ui/pill';
import { materialTxnStatusBadge, type StatusBadgeLabels } from './status-badge';

/** One diesel issuance history row — shared by diesel-screen.tsx (Supervisor) and accountant-diesel-screen.tsx (read-only monitor). */
export function IssuanceRow({
  row,
  litresSuffix,
  testIdPrefix,
  regNo,
  siteLabel,
  ui,
}: {
  row: FuelIssuance;
  litresSuffix: string;
  testIdPrefix: string;
  regNo: string;
  /** Set only where the caller can span multiple sites (accountant); omitted for the single-site Supervisor view. */
  siteLabel?: string;
  ui: StatusBadgeLabels;
}) {
  const badge = materialTxnStatusBadge(row.status, ui);
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0" data-testid={`${testIdPrefix}-${row.id}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {formatBusinessDateShort(row.businessDate)} · {regNo}
          {siteLabel ? ` · ${siteLabel}` : ''}
        </p>
        {row.note && <p className="truncate text-xs text-muted-foreground">{row.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums">
          {row.litres} {litresSuffix}
        </span>
        <Pill tone={badge.tone}>{badge.label}</Pill>
      </div>
    </li>
  );
}
