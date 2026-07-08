'use client';

/**
 * "My expense requests" — the requester's own EXPENSE_ADD requests, newest
 * first. Two renderings share one data hook:
 *   - `MyExpenseRequests`        full card list (requests screens).
 *   - `MyExpenseRequestsSummary` compact status-counts + last-3 dashboard card.
 *
 * Filtered to type === 'EXPENSE_ADD' on purpose: on the driver requests page
 * this sits alongside the existing RequestsScreen (VEHICLE_SWITCH), which has
 * its own generic "my requests" list — this one stays scoped to the expense
 * flow so the two don't show duplicate/confusing entries.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ApprovalRequest, ApprovalStatus, ExpenseCategory } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { formatBusinessDateShort } from '@/lib/business-date';
import { formatPaise } from '@/lib/money';
import { useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { RequestStatusBadge } from '@/components/requests/request-bits';

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

export function MyExpenseRequests() {
  const m = useMessages();
  const { requests, isPending, error, refetch } = useMyExpenseRequests();

  return (
    <Card data-testid="my-expense-requests">
      <CardHeader>
        <CardTitle>{m.EXPENSE_REQUEST_UI.myRequestsTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : requests.length === 0 ? (
          <EmptyState label={m.EXPENSE_REQUEST_UI.myRequestsEmpty} />
        ) : (
          <ul className="grid gap-3">
            {requests.map((r) => (
              <ExpenseRequestRow key={r.id} request={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseRequestRow({ request: r }: { request: ApprovalRequest }) {
  const m = useMessages();
  const amount = amountFrom(r.payload);
  const category = categoryFrom(m, r.payload);
  const date = dateFrom(r.payload);

  return (
    <li className="grid gap-1.5 rounded-lg border border-input p-3" data-testid={`my-expense-request-${r.id}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{m.APPROVAL_TYPE_LABELS[r.type]}</p>
        <RequestStatusBadge status={r.status} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
        {amount && <span className="font-medium text-foreground">{amount}</span>}
        {category && <span>{category}</span>}
        {date && <span>{date}</span>}
      </div>
      {r.status === 'REJECTED' && r.comment && (
        <Notice tone="error" testId={`my-expense-request-${r.id}-reason`}>
          {m.EXPENSE_REQUEST_UI.rejectedReasonPrefix} {r.comment}
        </Notice>
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
