'use client';

/**
 * Accountant Verification desk (/accountant/verify) — split out of the accountant dashboard
 * 2026-07-18 (client request): the dashboard is now BRIEFS ONLY (counts + newest 1–2 rows +
 * links); every actual ✓ verify / 🚩 flag action happens here instead, on its own page ("for
 * doing any task on that topic, you go to their page").
 *
 * Hosts the three FULL "awaiting your tick" queues — unverified expenses, cash transfers and
 * vendor payments — moved verbatim from the old accountant-dashboard-screen.tsx (same
 * VerifyRow component, same endpoints, same two-tick semantics: an accountant's ✓ or 🚩 here is
 * final and immutable, even for the Owner). Driven by the same GET /accountant/queue the
 * dashboard uses for its counts — no new endpoint. Each section carries an anchor id so the
 * dashboard's brief cards can deep-link straight to it (e.g. /accountant/verify#expenses).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag } from 'lucide-react';
import type {
  AccountantQueue,
  CashTransfer,
  Expense,
  UUID,
  User,
  VendorPayment,
  VerifyInput,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { formatBusinessDate } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

// Module-local — the frozen i18n catalogs carry no accountant-verify copy yet.
const UI = {
  en: {
    title: 'Verification desk',
    subtitle: 'Every money event needs your ✓ tick (or a 🚩 flag) — this is final, even for the Owner.',
    fromLabel: 'By',
    expensesTitle: 'Expenses awaiting your tick',
    transfersTitle: 'Cash transfers awaiting your tick',
    vendorTitle: 'Vendor payments awaiting your tick',
    empty: 'Nothing waiting.',
    verifyAction: 'Verify',
    flagAction: 'Flag',
    flagNotePlaceholder: "What didn't match?",
    flagNoteRequired: 'A note is required to flag',
    flagSubmit: 'Submit flag',
    cancel: 'Cancel',
    verifiedNotice: 'Verified.',
    flaggedNotice: 'Flagged.',
    transferArrow: '→',
    vendorKindPayment: 'Paid to vendor',
    vendorKindReceipt: 'Received from vendor',
  },
  hi: {
    title: 'सत्यापन डेस्क',
    subtitle: 'हर पैसे की एंट्री को आपकी ✓ जाँच चाहिए (या 🚩 फ़्लैग) — यह पक्का है, मालिक के लिए भी।',
    fromLabel: 'द्वारा',
    expensesTitle: 'खर्च जिनकी जाँच बाकी है',
    transfersTitle: 'कैश ट्रांसफर जिनकी जाँच बाकी है',
    vendorTitle: 'वेंडर भुगतान जिनकी जाँच बाकी है',
    empty: 'कुछ भी लंबित नहीं।',
    verifyAction: 'सत्यापित करें',
    flagAction: 'फ़्लैग करें',
    flagNotePlaceholder: 'क्या मेल नहीं खाया?',
    flagNoteRequired: 'फ़्लैग करने के लिए नोट ज़रूरी है',
    flagSubmit: 'फ़्लैग भेजें',
    cancel: 'रद्द करें',
    verifiedNotice: 'सत्यापित हो गया।',
    flaggedNotice: 'फ़्लैग कर दिया।',
    transferArrow: '→',
    vendorKindPayment: 'वेंडर को दिया',
    vendorKindReceipt: 'वेंडर से मिला',
  },
} as const;
type Ui = { [K in keyof typeof UI.en]: string };

export function AccountantVerifyScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();

  const queueQ = useQuery({
    queryKey: ['accountant-queue'],
    queryFn: () => api<AccountantQueue>('GET', '/accountant/queue'),
  });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  const nameOf = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? `${id.slice(0, 8)}…`;

  const invalidateQueue = () => void queryClient.invalidateQueries({ queryKey: ['accountant-queue'] });

  if (queueQ.isPending) {
    return <LoadingState />;
  }
  if (queueQ.error) {
    return <ErrorState error={queueQ.error} onRetry={() => void queueQ.refetch()} />;
  }
  const q = queueQ.data;
  if (!q) return null;

  return (
    <div className="grid gap-4" data-testid="accountant-verify">
      <div>
        <h1 className="text-lg font-semibold">{ui.title}</h1>
        <p className="text-sm text-muted-foreground">{ui.subtitle}</p>
      </div>

      <Card id="expenses" data-testid="verify-expenses">
        <CardHeader>
          <CardTitle>{ui.expensesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedExpenses.length === 0 ? (
            <EmptyState label={ui.empty} />
          ) : (
            <ul className="grid gap-3">
              {q.unverifiedExpenses.map((e: Expense) => (
                <VerifyRow
                  key={e.id}
                  id={e.id}
                  endpoint={`/records/expense/${e.id}/verify`}
                  ui={ui}
                  onDone={invalidateQueue}
                  primary={
                    <>
                      <span className="min-w-0 truncate text-sm font-medium">{m.EXPENSE_CATEGORY_LABELS[e.category]}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(e.amountPaise)}</span>
                    </>
                  }
                  secondary={`${ui.fromLabel} ${nameOf(e.enteredBy)} · ${formatBusinessDate(e.businessDate)}${e.remark ? ` · ${e.remark}` : ''}`}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="transfers" data-testid="verify-transfers">
        <CardHeader>
          <CardTitle>{ui.transfersTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedTransfers.length === 0 ? (
            <EmptyState label={ui.empty} />
          ) : (
            <ul className="grid gap-3">
              {q.unverifiedTransfers.map((t: CashTransfer) => (
                <VerifyRow
                  key={t.id}
                  id={t.id}
                  endpoint={`/cash-transfers/${t.id}/verify`}
                  ui={ui}
                  onDone={invalidateQueue}
                  primary={
                    <>
                      <span className="min-w-0 truncate text-sm font-medium">
                        {nameOf(t.fromUserId)} {ui.transferArrow} {nameOf(t.toUserId)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</span>
                    </>
                  }
                  secondary={`${formatBusinessDate(t.businessDate)}${t.note ? ` · ${t.note}` : ''}`}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="vendor-payments" data-testid="verify-vendor-payments">
        <CardHeader>
          <CardTitle>{ui.vendorTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedVendorPayments.length === 0 ? (
            <EmptyState label={ui.empty} />
          ) : (
            <ul className="grid gap-3">
              {q.unverifiedVendorPayments.map((v: VendorPayment) => (
                <VerifyRow
                  key={v.id}
                  id={v.id}
                  endpoint={`/vendors/payments/${v.id}/verify`}
                  ui={ui}
                  onDone={invalidateQueue}
                  primary={
                    <>
                      <span className="min-w-0 truncate text-sm font-medium">
                        {v.kind === 'PAYMENT' ? ui.vendorKindPayment : ui.vendorKindReceipt}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(v.amountPaise)}</span>
                    </>
                  }
                  secondary={`${formatBusinessDate(v.businessDate)}${v.note ? ` · ${v.note}` : ''}`}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** One "awaiting tick" row: ✓ verify or 🚩 flag (required note), shared shape across the
 * three money surfaces that never went through a request (expense / cash-transfer / vendor payment).
 * Moved verbatim from the old accountant-dashboard-screen.tsx (CW-3). */
function VerifyRow({
  id,
  endpoint,
  primary,
  secondary,
  onDone,
  ui,
}: {
  id: UUID;
  endpoint: string;
  primary: React.ReactNode;
  secondary: string;
  onDone: () => void;
  ui: Ui;
}) {
  const m = useMessages();
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [result, setResult] = useState<'verified' | 'flagged' | null>(null);

  const verify = useMutation({
    mutationFn: (input: VerifyInput) => api('POST', endpoint, input),
    onSuccess: (_data, input) => {
      setResult(input.ok ? 'verified' : 'flagged');
      setFlagging(false);
      onDone();
    },
  });

  const serverError =
    verify.error instanceof ApiClientError
      ? apiErrorMessage(m, verify.error.code)
      : verify.error
        ? apiErrorMessage(m)
        : null;

  return (
    <li className="grid gap-2 rounded-lg border border-input p-3" data-testid={`verify-row-${id}`}>
      <div className="flex items-baseline justify-between gap-3">{primary}</div>
      <p className="text-xs text-muted-foreground">{secondary}</p>

      {result ? (
        <Notice tone={result === 'verified' ? 'success' : 'warning'} testId={`verify-result-${id}`}>
          {result === 'verified' ? ui.verifiedNotice : ui.flaggedNotice}
        </Notice>
      ) : !flagging ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid={`verify-flag-${id}`}
            disabled={verify.isPending}
            onClick={() => setFlagging(true)}
          >
            <Flag className="size-3.5" aria-hidden="true" />
            {ui.flagAction}
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn('bg-emerald-600 text-white hover:bg-emerald-600/90')}
            data-testid={`verify-ok-${id}`}
            disabled={verify.isPending}
            onClick={() => verify.mutate({ ok: true })}
          >
            <Check className="size-3.5" aria-hidden="true" />
            {ui.verifyAction}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Textarea
            aria-label={ui.flagNotePlaceholder}
            placeholder={ui.flagNotePlaceholder}
            className="min-h-14"
            data-testid={`verify-note-${id}`}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (noteError) setNoteError(null);
            }}
          />
          {noteError && (
            <p className="text-sm text-destructive" role="alert">
              {noteError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" data-testid={`verify-flag-cancel-${id}`} onClick={() => setFlagging(false)}>
              {ui.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid={`verify-flag-submit-${id}`}
              disabled={verify.isPending}
              onClick={() => {
                if (!note.trim()) {
                  setNoteError(ui.flagNoteRequired);
                  return;
                }
                verify.mutate({ ok: false, flagNote: note.trim() });
              }}
            >
              {ui.flagSubmit}
            </Button>
          </div>
        </div>
      )}
      {serverError && (
        <Notice tone="error" testId={`verify-error-${id}`}>
          {serverError}
        </Notice>
      )}
    </li>
  );
}
