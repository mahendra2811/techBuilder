'use client';

import type { FuelStockPurchase } from '@techbuilder/contracts';
import { formatBusinessDateShort } from '@/lib/business-date';
import { formatPaise } from '@/lib/money';

/** One diesel bulk-purchase history row — shared by diesel-screen.tsx (Supervisor) and accountant-diesel-screen.tsx (read-only monitor). */
export function PurchaseRow({
  row,
  litresSuffix,
  testIdPrefix,
  siteLabel,
}: {
  row: FuelStockPurchase;
  litresSuffix: string;
  testIdPrefix: string;
  /** Set only where the caller can span multiple sites (accountant); omitted for the single-site Supervisor view. */
  siteLabel?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0" data-testid={`${testIdPrefix}-${row.id}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {formatBusinessDateShort(row.businessDate)}
          {siteLabel ? ` · ${siteLabel}` : ''}
        </p>
        {row.note && <p className="truncate text-xs text-muted-foreground">{row.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium tabular-nums">
          {row.litres} {litresSuffix}
        </span>
        {row.amountPaise != null && <span className="text-xs text-muted-foreground tabular-nums">{formatPaise(row.amountPaise)}</span>}
      </div>
    </li>
  );
}
