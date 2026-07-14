/**
 * Pure vendor-ledger math (CW-6 — extracted so it's unit-tested; the service is a thin DB shell
 * that fetches the three row sets and hands them here).
 *
 * balance = purchased + received − paid (what the site owes the vendor):
 *  - purchased: VENDOR_CREDIT expenses (site bought on credit — increases what we owe).
 *  - paid:      vendor_payments with kind=PAYMENT (site paid the vendor — reduces what we owe).
 *  - received:  vendor_payments with kind=RECEIPT (vendor handed the site money-IN — Round 2;
 *               increases what we owe, mirroring an extra "purchase" the vendor fronted us).
 *
 * Aggregation is done in TS over an already-scoped row set (same shape as dashboards/reconciliation
 * — this codebase never does SQL GROUP BY for this kind of small per-vendor read).
 */
export interface VendorLedgerRow {
  amountPaise: number;
  /** 'YYYY-MM-DD' business date. */
  businessDate: string;
}

export interface VendorLedgerMonthBucket {
  month: string; // 'YYYY-MM'
  purchasedPaise: number;
  paidPaise: number;
  receivedPaise: number;
}

export interface VendorLedgerTotals {
  purchasedPaise: number;
  paidPaise: number;
  receivedPaise: number;
  balancePaise: number;
  months: VendorLedgerMonthBucket[];
}

export function computeVendorLedger(
  purchasedRows: VendorLedgerRow[],
  paidRows: VendorLedgerRow[],
  receivedRows: VendorLedgerRow[],
): VendorLedgerTotals {
  const months = new Map<string, { purchasedPaise: number; paidPaise: number; receivedPaise: number }>();
  const bucket = (month: string) => {
    let b = months.get(month);
    if (!b) {
      b = { purchasedPaise: 0, paidPaise: 0, receivedPaise: 0 };
      months.set(month, b);
    }
    return b;
  };

  let purchasedPaise = 0;
  for (const r of purchasedRows) {
    purchasedPaise += r.amountPaise;
    bucket(r.businessDate.slice(0, 7)).purchasedPaise += r.amountPaise;
  }
  let paidPaise = 0;
  for (const r of paidRows) {
    paidPaise += r.amountPaise;
    bucket(r.businessDate.slice(0, 7)).paidPaise += r.amountPaise;
  }
  let receivedPaise = 0;
  for (const r of receivedRows) {
    receivedPaise += r.amountPaise;
    bucket(r.businessDate.slice(0, 7)).receivedPaise += r.amountPaise;
  }

  return {
    purchasedPaise,
    paidPaise,
    receivedPaise,
    balancePaise: purchasedPaise + receivedPaise - paidPaise,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, purchasedPaise: v.purchasedPaise, paidPaise: v.paidPaise, receivedPaise: v.receivedPaise })),
  };
}
