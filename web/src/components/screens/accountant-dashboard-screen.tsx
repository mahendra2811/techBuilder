'use client';

/**
 * Accountant dashboard (/accountant) — CW-3, restructured 2026-07-18 (client request) into a
 * BRIEFS-ONLY landing page: KPI strip + short summaries with links out to the pages that own
 * each action. No decide/verify controls live here anymore — "for doing any task on that topic,
 * you go to their page" (the client's own framing).
 *
 * Where each action now lives:
 *  - Pending money requests → decided on /accountant/approvals (unchanged, out of this file's
 *    scope — ApprovalsScreen).
 *  - Expenses / cash transfers / vendor payments awaiting his ✓/🚩 tick → moved verbatim
 *    (VerifyRow and all) to the new /accountant/verify "Verification desk" page
 *    (accountant-verify-screen.tsx). This card only shows a count + the newest 1–2 rows.
 *  - Diesel issued-vs-received mismatches → moved to the new /accountant/diesel page
 *    (accountant-diesel-screen.tsx, full stock/purchases/issuances/flags visibility for his
 *    site(s)). This card is count + link only — no row detail anymore.
 *
 * Still driven entirely by GET /accountant/queue (AccountantQueue) — this screen just renders
 * fewer of the same fields (counts + slices) than before; no new endpoint needed.
 *
 * Name resolution is best-effort: GET /users is scope-filtered per role (mirrors the approvals
 * screen's `nameOf`/`usersById` pattern) but the ACCOUNTANT role may still fall back to a
 * shortened id for requester/party names outside his own scope — a backend scope nuance, not a
 * bug introduced here.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { AccountantQueue, CashTransfer, Expense, User, UUID, VendorPayment } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { formatBusinessDate, formatKolkataDateTime } from '@/lib/business-date';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KhataCard } from '@/components/khata-card';
import { PayloadSummary } from '@/components/requests/request-bits';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';

// Module-local — the frozen i18n catalogs carry no accountant-work-queue copy yet.
const UI = {
  en: {
    title: 'Accountant desk',
    subtitle: 'A quick brief — go to each page to act.',
    kpiPending: 'Pending requests',
    kpiUnverified: 'Awaiting your tick',
    kpiDecidedToday: 'Today (approved/rejected/verified)',
    kpiCashInHand: 'Cash in hand',
    pendingTitle: 'Pending money requests',
    pendingSubtitle: 'Newest below — decide them all on the Approvals page.',
    pendingEmpty: 'No pending requests.',
    viewAllApprovals: 'Go to Approvals →',
    fromLabel: 'By',
    unverifiedExpensesTitle: 'Expenses awaiting your tick',
    unverifiedTransfersTitle: 'Cash transfers awaiting your tick',
    unverifiedVendorTitle: 'Vendor payments awaiting your tick',
    unverifiedEmpty: 'Nothing waiting.',
    goToVerify: 'Go to Verification desk →',
    goToVendors: 'Go to Vendors →',
    transferArrow: '→',
    vendorKindPayment: 'Paid to vendor',
    vendorKindReceipt: 'Received from vendor',
    dieselTitle: '🚩 Diesel',
    dieselSubtitle: "Stock, purchases, issuances and match flags for your site.",
    dieselFlagsLabel: 'mismatches',
    goToDiesel: 'Go to Diesel →',
  },
  hi: {
    title: 'अकाउंटेंट डेस्क',
    subtitle: 'संक्षिप्त जानकारी — काम करने के लिए हर पेज पर जाएं।',
    kpiPending: 'लंबित अनुरोध',
    kpiUnverified: 'आपकी जाँच का इंतज़ार',
    kpiDecidedToday: 'आज (स्वीकृत/अस्वीकृत/सत्यापित)',
    kpiCashInHand: 'हाथ में नकद',
    pendingTitle: 'लंबित पैसे के अनुरोध',
    pendingSubtitle: 'नीचे नए अनुरोध — सभी को Approvals पेज पर तय करें।',
    pendingEmpty: 'कोई लंबित अनुरोध नहीं।',
    viewAllApprovals: 'Approvals पर जाएँ →',
    fromLabel: 'द्वारा',
    unverifiedExpensesTitle: 'खर्च जिनकी जाँच बाकी है',
    unverifiedTransfersTitle: 'कैश ट्रांसफर जिनकी जाँच बाकी है',
    unverifiedVendorTitle: 'वेंडर भुगतान जिनकी जाँच बाकी है',
    unverifiedEmpty: 'कुछ भी लंबित नहीं।',
    goToVerify: 'सत्यापन डेस्क पर जाएँ →',
    goToVendors: 'वेंडर पर जाएँ →',
    transferArrow: '→',
    vendorKindPayment: 'वेंडर को दिया',
    vendorKindReceipt: 'वेंडर से मिला',
    dieselTitle: '🚩 डीज़ल',
    dieselSubtitle: 'आपकी साइट का स्टॉक, खरीद, आपूर्ति और मेल-न-खाना।',
    dieselFlagsLabel: 'बेमेल',
    goToDiesel: 'डीज़ल पर जाएँ →',
  },
} as const;

export function AccountantDashboardScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = UI[locale];

  const queueQ = useQuery({
    queryKey: ['accountant-queue'],
    queryFn: () => api<AccountantQueue>('GET', '/accountant/queue'),
  });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  const nameOf = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? `${id.slice(0, 8)}…`;

  if (queueQ.isPending) {
    return <LoadingState />;
  }
  if (queueQ.error) {
    return <ErrorState error={queueQ.error} onRetry={() => void queueQ.refetch()} />;
  }
  const q = queueQ.data;
  if (!q) return null;

  const unverifiedCount = q.unverifiedExpenses.length + q.unverifiedTransfers.length + q.unverifiedVendorPayments.length;

  return (
    <div className="grid gap-4" data-testid="accountant-dashboard">
      <div>
        <h1 className="text-lg font-semibold">{ui.title}</h1>
        <p className="text-sm text-muted-foreground">{ui.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi testId="acc-kpi-pending" value={String(q.pendingRequests.length)} label={ui.kpiPending} />
        <Kpi testId="acc-kpi-unverified" value={String(unverifiedCount)} label={ui.kpiUnverified} />
        <Kpi
          testId="acc-kpi-decided-today"
          value={`${q.decidedToday.approved}/${q.decidedToday.rejected}/${q.decidedToday.verified}`}
          label={ui.kpiDecidedToday}
        />
        <Kpi testId="acc-kpi-cash" value={formatPaise(q.cashInHandPaise)} label={ui.kpiCashInHand} />
      </div>

      <KhataCard />

      {/* Brief: pending money requests — count + newest 1–2, decide on /accountant/approvals. */}
      <Card data-testid="acc-pending-requests">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{ui.pendingTitle}</span>
            <CountBadge value={q.pendingRequests.length} />
          </CardTitle>
          <CardDescription>{ui.pendingSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {q.pendingRequests.length === 0 ? (
            <EmptyState label={ui.pendingEmpty} />
          ) : (
            <ul className="grid gap-3" data-testid="acc-pending-list">
              {q.pendingRequests.slice(0, 2).map((r) => (
                <li key={r.id} className="grid gap-1.5 rounded-lg border border-input p-3" data-testid={`acc-pending-row-${r.id}`}>
                  <PayloadSummary type={r.type} payload={r.payload} />
                  <p className="text-xs text-muted-foreground">
                    {ui.fromLabel} {nameOf(r.requestedBy)} · {formatKolkataDateTime(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/accountant/approvals" className="text-sm font-medium text-primary hover:underline" data-testid="acc-view-all-approvals">
            {ui.viewAllApprovals}
          </Link>
        </CardContent>
      </Card>

      {/* Brief: expenses awaiting tick — count + newest 1–2, act on /accountant/verify. */}
      <Card data-testid="acc-unverified-expenses">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{ui.unverifiedExpensesTitle}</span>
            <CountBadge value={q.unverifiedExpenses.length} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {q.unverifiedExpenses.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
          ) : (
            <ul className="grid gap-3" data-testid="acc-unverified-expenses-list">
              {q.unverifiedExpenses.slice(0, 2).map((e: Expense) => (
                <li key={e.id} className="grid gap-1 rounded-lg border border-input p-3" data-testid={`acc-brief-expense-${e.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">{m.EXPENSE_CATEGORY_LABELS[e.category]}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(e.amountPaise)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ui.fromLabel} {nameOf(e.enteredBy)} · {formatBusinessDate(e.businessDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/accountant/verify#expenses" className="text-sm font-medium text-primary hover:underline" data-testid="acc-goto-verify-expenses">
            {ui.goToVerify}
          </Link>
        </CardContent>
      </Card>

      {/* Brief: cash transfers awaiting tick — count + newest 1–2, act on /accountant/verify. */}
      <Card data-testid="acc-unverified-transfers">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{ui.unverifiedTransfersTitle}</span>
            <CountBadge value={q.unverifiedTransfers.length} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {q.unverifiedTransfers.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
          ) : (
            <ul className="grid gap-3" data-testid="acc-unverified-transfers-list">
              {q.unverifiedTransfers.slice(0, 2).map((t: CashTransfer) => (
                <li key={t.id} className="grid gap-1 rounded-lg border border-input p-3" data-testid={`acc-brief-transfer-${t.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {nameOf(t.fromUserId)} {ui.transferArrow} {nameOf(t.toUserId)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatBusinessDate(t.businessDate)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/accountant/verify#transfers" className="text-sm font-medium text-primary hover:underline" data-testid="acc-goto-verify-transfers">
            {ui.goToVerify}
          </Link>
        </CardContent>
      </Card>

      {/* Brief: vendor payments awaiting tick — count + newest 1–2; act on /accountant/verify,
          ledgers live on /accountant/vendors. */}
      <Card data-testid="acc-unverified-vendor-payments">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{ui.unverifiedVendorTitle}</span>
            <CountBadge value={q.unverifiedVendorPayments.length} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {q.unverifiedVendorPayments.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
          ) : (
            <ul className="grid gap-3" data-testid="acc-unverified-vendor-list">
              {q.unverifiedVendorPayments.slice(0, 2).map((v: VendorPayment) => (
                <li key={v.id} className="grid gap-1 rounded-lg border border-input p-3" data-testid={`acc-brief-vendor-${v.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {v.kind === 'PAYMENT' ? ui.vendorKindPayment : ui.vendorKindReceipt}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(v.amountPaise)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatBusinessDate(v.businessDate)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/accountant/verify#vendor-payments" className="text-sm font-medium text-primary hover:underline" data-testid="acc-goto-verify-vendor">
              {ui.goToVerify}
            </Link>
            <Link href="/accountant/vendors" className="text-sm font-medium text-primary hover:underline" data-testid="acc-goto-vendors">
              {ui.goToVendors}
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Brief: diesel flags — count + link only, full detail on /accountant/diesel. */}
      <Card data-testid="acc-diesel-flags">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{ui.dieselTitle}</span>
            {q.fuelFlags.length > 0 && (
              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium tabular-nums text-destructive" data-testid="acc-diesel-flags-count">
                {q.fuelFlags.length} {ui.dieselFlagsLabel}
              </span>
            )}
          </CardTitle>
          <CardDescription>{ui.dieselSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/accountant/diesel" className="text-sm font-medium text-primary hover:underline" data-testid="acc-goto-diesel">
            {ui.goToDiesel}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ value, label, testId }: { value: string; label: string; testId: string }) {
  return (
    <Card size="sm" data-testid={testId}>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

/** Small rounded count pill shown next to a brief card's title. Renders nothing at 0 so an
 * all-clear card reads clean (no "0" noise). */
function CountBadge({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums" data-testid="count-badge">
      {value}
    </span>
  );
}
