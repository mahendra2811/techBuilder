'use client';

/**
 * WO-13 shared row renderers for a single day's slice of insights data — reused by
 * both the site-wide insights screen (each list inside its own <Card>) and the
 * per-person drill-down (all three lists inside one per-day <Card>).
 */
import { Paperclip } from 'lucide-react';
import type { ApprovalRequest, Expense, ProgressNote, UUID } from '@techbuilder/contracts';
import { formatKolkataDateTime } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { EmptyState } from '@/components/entry/states';
import { RequestStatusBadge } from '@/components/requests/request-bits';

export type UserNameFn = (id: UUID) => string;

export function ProgressList({ notes, userName }: { notes: ProgressNote[]; userName: UserNameFn }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  if (notes.length === 0) return <EmptyState label={i.progressEmpty} />;
  return (
    <ul className="divide-y" data-testid="insights-progress-list">
      {notes.map((n) => (
        <li key={n.id} className="grid gap-1 py-2 first:pt-0 last:pb-0" data-testid={`insights-progress-row-${n.id}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{userName(n.enteredBy)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatKolkataDateTime(n.createdAt)}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{n.text}</p>
          {n.mediaIds.length > 0 && (
            <span className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden="true" />
              {n.mediaIds.length} {i.attachmentsSuffix}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ExpenseList({ expenses, userName }: { expenses: Expense[]; userName: UserNameFn }) {
  const m = useMessages();
  if (expenses.length === 0) return <EmptyState label={m.INSIGHTS_UI.expensesEmpty} />;
  return (
    <ul className="divide-y" data-testid="insights-expense-list">
      {expenses.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
          data-testid={`insights-expense-row-${e.id}`}
        >
          <div className="min-w-0">
            <p className="truncate font-medium">
              {m.EXPENSE_CATEGORY_LABELS[e.category]}
              {e.billNo ? ` · ${e.billNo}` : ''}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {userName(e.enteredBy)} · {e.paidVia === 'CASH' ? m.VENDOR_UI.paidByCash : m.VENDOR_UI.paidByCredit}
            </p>
          </div>
          <span className="shrink-0 font-medium tabular-nums">{formatPaise(e.amountPaise)}</span>
        </li>
      ))}
    </ul>
  );
}

export function RequestList({ requests, userName }: { requests: ApprovalRequest[]; userName: UserNameFn }) {
  const m = useMessages();
  if (requests.length === 0) return <EmptyState label={m.INSIGHTS_UI.requestsEmpty} />;
  return (
    <ul className="grid gap-2" data-testid="insights-request-list">
      {requests.map((r) => {
        const amount = r.type === 'EXPENSE_ADD' && typeof r.payload.amountPaise === 'number' ? r.payload.amountPaise : null;
        return (
          <li key={r.id} className="rounded-lg border border-input p-3 text-sm" data-testid={`insights-request-row-${r.id}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{m.APPROVAL_TYPE_LABELS[r.type]}</span>
              <RequestStatusBadge status={r.status} />
            </div>
            {amount !== null && <p className="mt-1 font-medium tabular-nums">{formatPaise(amount)}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {m.APPROVALS_UI.raisedByPrefix}: {userName(r.requestedBy)}
              {r.status !== 'PENDING' &&
                ` · ${m.APPROVALS_UI.decidedByPrefix}: ${r.approverUserId ? userName(r.approverUserId) : '—'}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
