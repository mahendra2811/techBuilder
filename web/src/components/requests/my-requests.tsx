'use client';

/**
 * "My expense requests" — the requester's own EXPENSE_ADD requests, newest
 * first. Renderings share one data hook:
 *   - `ExpenseHistorySections`   worker/driver history hub — three tappable
 *     sub-page cards (pending/rejected, approved, money received), used by
 *     `expense-request-screen.tsx` below the request form.
 *   - `MyExpenseRequestsSummary` compact status-counts + last-3 dashboard card.
 *
 * Filtered to type === 'EXPENSE_ADD' on purpose: on the driver requests page
 * this sits alongside the existing RequestsScreen (VEHICLE_SWITCH), which has
 * its own generic "my requests" list — this one stays scoped to the expense
 * flow so the two don't show duplicate/confusing entries.
 *
 * Round 2 (CW-3): the two-tick state is visible here too — an APPROVED row shows
 * a ✓ "verified by accountant" badge once `verifiedAt` is set, or a 🚩 "flagged"
 * badge if the accountant's tick came back negative (`flagged`), so a requester
 * sees the full lifecycle, not just "Approved".
 *
 * Accordion (client feedback): each history sub-page collapses a row to
 * amount/date/status(+tick) and expands on tap to the rest of the payload —
 * mirrors the single-open accordion pattern in
 * `components/screens/approvals-screen.tsx`. `MyExpenseRequestsSummary` (the
 * dashboard card) is untouched — it already only ever shows a one-line digest.
 *
 * WORKER restructure (nav.ts): the old single flat `MyExpenseRequests` list
 * was split into three sub-pages — `ExpenseHistorySections` is the new mount
 * point. It also fetches `GET /cash-transfers?tag=WORK` (client-filtered to
 * rows where the caller is the receiver) for the "money received" section —
 * salary/personal money deliberately does NOT belong here (see Profile page).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ApprovalRequest, ApprovalStatus, ExpenseCategory, MyMoney, Vendor } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { formatBusinessDate, formatBusinessDateShort } from '@/lib/business-date';
import { formatPaise } from '@/lib/money';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { RequestStatusBadge } from '@/components/requests/request-bits';
import { SectionCard } from '@/components/ui/section-card';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';

// Module-local — the frozen EXPENSE_REQUEST_UI catalog predates the three-section
// history split (pending/rejected · approved · money received).
const HISTORY_UI = {
  en: {
    pendingTitle: 'Pending / rejected requests',
    pendingEmpty: 'No pending or rejected requests.',
    approvedTitle: 'Approved expenses',
    approvedEmpty: 'No approved expenses yet.',
    approvedHint: 'These amounts are debited from your work khata.',
    receivedTitle: 'Money received',
    receivedEmpty: 'No money received yet.',
    receivedHint: 'Work money credited to your khata — salary/personal money shows on your Profile page instead.',
    fromLabel: 'From',
  },
  hi: {
    pendingTitle: 'लंबित–अस्वीकृत अनुरोध',
    pendingEmpty: 'कोई लंबित या अस्वीकृत अनुरोध नहीं।',
    approvedTitle: 'स्वीकृत ख़र्च',
    approvedEmpty: 'अभी तक कोई स्वीकृत ख़र्च नहीं।',
    approvedHint: 'यह रकम आपके काम-खाते से काटी जाती है।',
    receivedTitle: 'मिला पैसा',
    receivedEmpty: 'अभी तक कोई पैसा नहीं मिला।',
    receivedHint: 'काम का पैसा आपके खाते में जमा होता है — वेतन/निजी पैसा आपकी प्रोफ़ाइल पेज पर दिखेगा।',
    fromLabel: 'किससे',
  },
} as const;

// Module-local — the frozen EXPENSE_REQUEST_UI catalog predates the two-tick badges.
const TICK_UI = {
  en: { verified: '✓ Verified by accountant', flagged: '🚩 Flagged — under review' },
  hi: { verified: '✓ अकाउंटेंट ने जाँच लिया', flagged: '🚩 जाँच में अटका' },
} as const;

// Module-local — the frozen EXPENSE_REQUEST_UI catalog predates the accordion's expanded details.
const ROW_UI = {
  en: {
    expand: 'Show details',
    collapse: 'Hide details',
    attachmentsLabel: 'Attachments',
    attachmentsCount: (n: number) => `${n} photo${n === 1 ? '' : 's'}`,
  },
  hi: {
    expand: 'विवरण देखें',
    collapse: 'विवरण छुपाएं',
    attachmentsLabel: 'फ़ोटो',
    attachmentsCount: (n: number) => `${n} फ़ोटो`,
  },
} as const;

function useMyExpenseRequests() {
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const requestsQ = useQuery({ queryKey: ['requests', 'ALL'], queryFn: () => api<ApprovalRequest[]>('GET', '/requests') });
  const myUserId = meQ.data?.user.id;
  const mine = (requestsQ.data ?? []).filter((r) => r.type === 'EXPENSE_ADD' && r.requestedBy === myUserId);
  return {
    requests: mine,
    isPending: meQ.isPending || requestsQ.isPending,
    error: meQ.error ?? requestsQ.error,
    refetch: () => {
      void meQ.refetch();
      void requestsQ.refetch();
    },
  };
}

function amountFrom(payload: Record<string, unknown>): string | undefined {
  return typeof payload.amountPaise === 'number' ? formatPaise(payload.amountPaise) : undefined;
}

function categoryFrom(m: Messages, payload: Record<string, unknown>): string | undefined {
  const cat = payload.category;
  return typeof cat === 'string' && cat in m.EXPENSE_CATEGORY_LABELS
    ? m.EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]
    : undefined;
}

function dateFrom(payload: Record<string, unknown>): string | undefined {
  return typeof payload.businessDate === 'string' ? formatBusinessDateShort(payload.businessDate) : undefined;
}

/** payload.vendorId → the shop's name (resolved from the fetched vendor list), falling back to
 * a shortened id (matches the `${id.slice(0, 8)}…` convention used elsewhere, e.g. ledger-screen). */
function vendorNameFrom(payload: Record<string, unknown>, vendors: Vendor[]): string | undefined {
  const vendorId = typeof payload.vendorId === 'string' ? payload.vendorId : undefined;
  if (!vendorId) return undefined;
  const vendor = vendors.find((v) => v.id === vendorId);
  return vendor?.name ?? `${vendorId.slice(0, 8)}…`;
}

function mediaCountFrom(payload: Record<string, unknown>): number {
  return Array.isArray(payload.mediaIds) ? payload.mediaIds.length : 0;
}

function remarkFrom(payload: Record<string, unknown>): string | undefined {
  return typeof payload.remark === 'string' && payload.remark.trim() ? payload.remark : undefined;
}

/**
 * The worker/driver history hub: three tappable section cards, each opening a
 * `useSubPage` detail view (URL unchanged, back button via `SubPageHeader`).
 * Section (a) and (b) share the accordion request-row rendering; (c) is a new
 * money-received list built off `GET /cash-transfers?tag=WORK`.
 */
export function ExpenseHistorySections() {
  const locale = useLocale();
  const ui = HISTORY_UI[locale];

  const { requests, isPending: requestsPending, error: requestsError, refetch: requestsRefetch } = useMyExpenseRequests();
  // Shop names for the expanded "paid via" line — same query the request form itself uses
  // (workers/drivers are permitted to call GET /vendors); fetched once here, not per-row.
  const vendorsQ = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('GET', '/vendors') });
  // frozen.11: the khata-credits view of GET /me/money — server-scoped to the caller AND the
  // giver names come pre-resolved (workers/drivers can't read the user directory themselves).
  const receivedQ = useQuery({
    queryKey: ['my-money', 'WORK'],
    queryFn: () => api<MyMoney>('GET', '/me/money?tag=WORK'),
  });

  // Pending first, then rejected — each group keeps the server's newest-first order.
  const pendingRejected = [
    ...requests.filter((r) => r.status === 'PENDING'),
    ...requests.filter((r) => r.status === 'REJECTED'),
  ];
  const approved = requests.filter((r) => r.status === 'APPROVED');
  const received = receivedQ.data?.entries ?? [];

  const { current, open, close } = useSubPage<'pending' | 'approved' | 'received'>();

  if (current === 'pending') {
    return (
      <div className="grid gap-4" data-testid="expense-sub-pending-page">
        <SubPageHeader title={ui.pendingTitle} onBack={close} />
        <ExpenseRequestListCard
          requests={pendingRejected}
          vendors={vendorsQ.data ?? []}
          isPending={requestsPending}
          error={requestsError}
          onRetry={requestsRefetch}
          emptyLabel={ui.pendingEmpty}
        />
      </div>
    );
  }

  if (current === 'approved') {
    return (
      <div className="grid gap-4" data-testid="expense-sub-approved-page">
        <SubPageHeader title={ui.approvedTitle} onBack={close} />
        <p className="text-xs text-muted-foreground">{ui.approvedHint}</p>
        <ExpenseRequestListCard
          requests={approved}
          vendors={vendorsQ.data ?? []}
          isPending={requestsPending}
          error={requestsError}
          onRetry={requestsRefetch}
          emptyLabel={ui.approvedEmpty}
        />
      </div>
    );
  }

  if (current === 'received') {
    return (
      <div className="grid gap-4" data-testid="expense-sub-received-page">
        <SubPageHeader title={ui.receivedTitle} onBack={close} />
        <p className="text-xs text-muted-foreground">{ui.receivedHint}</p>
        <Card>
          <CardContent className="pt-4">
            {receivedQ.isPending ? (
              <LoadingState />
            ) : receivedQ.error ? (
              <ErrorState error={receivedQ.error} onRetry={() => void receivedQ.refetch()} />
            ) : received.length === 0 ? (
              <EmptyState label={ui.receivedEmpty} />
            ) : (
              <ul className="divide-y">
                {received.map((t) => (
                  <ReceivedMoneyRow key={t.id} entry={t} fromLabel={ui.fromLabel} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="expense-history-sections">
      <SectionCard
        testId="expense-sub-pending"
        title={ui.pendingTitle}
        count={requestsPending ? undefined : pendingRejected.length}
        onOpen={() => open('pending')}
      />
      <SectionCard
        testId="expense-sub-approved"
        title={ui.approvedTitle}
        count={requestsPending ? undefined : approved.length}
        onOpen={() => open('approved')}
      />
      <SectionCard
        testId="expense-sub-received"
        title={ui.receivedTitle}
        count={receivedQ.isPending ? undefined : received.length}
        onOpen={() => open('received')}
      />
    </div>
  );
}

/** Shared accordion list for the pending/rejected + approved sub-pages. */
function ExpenseRequestListCard({
  requests,
  vendors,
  isPending,
  error,
  onRetry,
  emptyLabel,
}: {
  requests: ApprovalRequest[];
  vendors: Vendor[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  emptyLabel: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="pt-4">
        {isPending ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : requests.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <ul className="grid gap-3">
            {requests.map((r) => (
              <ExpenseRequestRow
                key={r.id}
                request={r}
                vendors={vendors}
                isExpanded={expandedId === r.id}
                onToggle={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** One khata credit (frozen.11: `GET /me/money?tag=WORK` — giver name resolved server-side). */
function ReceivedMoneyRow({ entry: t, fromLabel }: { entry: MyMoney['entries'][number]; fromLabel: string }) {
  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`expense-received-row-${t.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{formatBusinessDate(t.businessDate)}</p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {fromLabel} {t.fromName}
        {t.note && ` · ${t.note}`}
      </p>
    </li>
  );
}

function ExpenseRequestRow({
  request: r,
  vendors,
  isExpanded,
  onToggle,
}: {
  request: ApprovalRequest;
  vendors: Vendor[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const m = useMessages();
  const locale = useLocale();
  const tickUi = TICK_UI[locale];
  const rowUi = ROW_UI[locale];
  const amount = amountFrom(r.payload);
  const category = categoryFrom(m, r.payload);
  const date = dateFrom(r.payload);
  const showTick = r.status === 'APPROVED' && (!!r.verifiedAt || r.flagged);

  const vendorName = vendorNameFrom(r.payload, vendors);
  const paidViaCredit = r.payload.paidVia === 'VENDOR_CREDIT';
  const mediaCount = mediaCountFrom(r.payload);
  const remark = remarkFrom(r.payload);

  return (
    <li className="rounded-lg border border-input" data-testid={`my-expense-request-${r.id}`}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
        data-testid={`my-expense-request-toggle-${r.id}`}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? rowUi.collapse : rowUi.expand}
        onClick={onToggle}
      >
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {amount && <span className="text-sm font-medium">{amount}</span>}
            <RequestStatusBadge status={r.status} />
            {showTick && (
              <Pill tone={r.flagged ? 'error' : 'success'} testId={`my-expense-request-${r.id}-tick`}>
                {r.flagged ? tickUi.flagged : tickUi.verified}
              </Pill>
            )}
          </div>
          {date && <p className="text-xs text-muted-foreground">{date}</p>}
        </div>
        {isExpanded ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <div className="grid gap-2 border-t border-input p-3 pt-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {category && (
              <div className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{m.REQUEST_FIELDS.category}</dt>
                <dd className="min-w-0 break-words">{category}</dd>
              </div>
            )}
            <div className="col-span-2 grid grid-cols-subgrid">
              <dt className="text-muted-foreground">{m.VENDOR_UI.paidByLabel}</dt>
              <dd className="min-w-0 break-words">
                {paidViaCredit ? `${m.VENDOR_UI.paidByCredit} — ${vendorName}` : m.VENDOR_UI.paidByCash}
              </dd>
            </div>
            {mediaCount > 0 && (
              <div className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{rowUi.attachmentsLabel}</dt>
                <dd className="min-w-0 break-words">{rowUi.attachmentsCount(mediaCount)}</dd>
              </div>
            )}
            {remark && (
              <div className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-muted-foreground">{m.REQUEST_FIELDS.remark}</dt>
                <dd className="min-w-0 break-words">{remark}</dd>
              </div>
            )}
          </dl>

          {r.status === 'REJECTED' && r.comment && (
            <Notice tone="error" testId={`my-expense-request-${r.id}-reason`}>
              {m.EXPENSE_REQUEST_UI.rejectedReasonPrefix} {r.comment}
            </Notice>
          )}
        </div>
      )}
    </li>
  );
}

/** Compact dashboard card: status counts + the last 3 requests, linking to the full form/list. */
export function MyExpenseRequestsSummary({ href }: { href: string }) {
  const m = useMessages();
  const { requests, isPending, error, refetch } = useMyExpenseRequests();

  const counts: Record<ApprovalStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const r of requests) counts[r.status]++;
  const last3 = requests.slice(0, 3);

  return (
    <Card data-testid="my-expense-requests-summary">
      <CardHeader>
        <CardTitle>{m.EXPENSE_REQUEST_UI.summaryTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isPending ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm" data-testid="my-expense-requests-summary-counts">
              <CountPill label={m.EXPENSE_REQUEST_UI.summaryPendingLabel} value={counts.PENDING} tone="amber" />
              <CountPill label={m.EXPENSE_REQUEST_UI.summaryApprovedLabel} value={counts.APPROVED} tone="emerald" />
              <CountPill label={m.EXPENSE_REQUEST_UI.summaryRejectedLabel} value={counts.REJECTED} tone="destructive" />
            </div>

            {last3.length === 0 ? (
              <EmptyState label={m.EXPENSE_REQUEST_UI.summaryEmpty} />
            ) : (
              <ul className="grid gap-2">
                {last3.map((r) => {
                  const amount = amountFrom(r.payload);
                  const date = dateFrom(r.payload);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-sm"
                      data-testid={`my-expense-requests-summary-${r.id}`}
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {amount}
                        {date ? ` · ${date}` : ''}
                      </span>
                      <RequestStatusBadge status={r.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <Link href={href} className="text-sm font-medium text-primary hover:underline" data-testid="my-expense-requests-summary-link">
          {m.EXPENSE_REQUEST_UI.summaryViewAll}
        </Link>
      </CardContent>
    </Card>
  );
}

const PILL_CLASS: Record<'amber' | 'emerald' | 'destructive', string> = {
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  destructive: 'bg-destructive/10 text-destructive',
};

function CountPill({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'emerald' | 'destructive' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${PILL_CLASS[tone]}`}>
      {value} {label}
    </span>
  );
}
