'use client';

/**
 * Accountant dashboard (/accountant) — CW-3. The per-site money desk's WORK QUEUE, NOT
 * analytics (client decision — no weekly/monthly rollups here; those stay SM/Owner-only).
 * GET /accountant/queue (AccountantQueue) drives everything: pending money requests
 * (decided on /accountant/approvals — his decide there IS the verify, one act), booked
 * money still awaiting his ✓/🚩 tick (SM-entered expenses, Owner/SM cash gives, vendor
 * payments — these never went through a request), diesel issued-vs-received mismatches,
 * what he decided/verified today, and cash currently in his own hands.
 *
 * Name resolution is best-effort: GET /users is scope-filtered per role (mirrors the
 * approvals screen's `nameOf`/`usersById` pattern) but the ACCOUNTANT role currently gets
 * only himself back (backend `UsersService.list` has no ACCOUNTANT branch — falls to
 * self-only), so requester/party names mostly fall back to a shortened id. Same story for
 * GET /vehicles (`VehiclesService.list` has no ACCOUNTANT branch — returns an empty list),
 * so diesel-flag vehicles also fall back to a shortened id. Both are backend scope gaps,
 * not a client bug — flagged in the CW-3 handoff, not fixed here (out of web-only scope).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag } from 'lucide-react';
import type {
  AccountantQueue,
  CashTransfer,
  Expense,
  FuelMatchFlag,
  User,
  UUID,
  Vehicle,
  VendorPayment,
  VerifyInput,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { formatBusinessDate, formatKolkataDateTime } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ShowMore } from '@/components/ui/show-more';
import { KhataCard } from '@/components/khata-card';
import { MyMoneyCard } from '@/components/my-money-card';
import { PayloadSummary } from '@/components/requests/request-bits';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

// Module-local — the frozen i18n catalogs carry no accountant-work-queue copy yet.
const UI = {
  en: {
    title: 'Accountant desk',
    subtitle: 'Your work queue — nothing to analyze, just decide and verify.',
    kpiPending: 'Pending requests',
    kpiUnverified: 'Awaiting your tick',
    kpiDecidedToday: 'Today (approved/rejected/verified)',
    kpiCashInHand: 'Cash in hand',
    pendingTitle: 'Pending money requests',
    pendingSubtitle: 'Decide these on the Approvals page.',
    pendingEmpty: 'No pending requests.',
    viewAllApprovals: 'Go to Approvals →',
    decideLink: 'Decide →',
    fromLabel: 'By',
    unverifiedExpensesTitle: 'Expenses awaiting your tick',
    unverifiedTransfersTitle: 'Cash transfers awaiting your tick',
    unverifiedVendorTitle: 'Vendor payments awaiting your tick',
    unverifiedEmpty: 'Nothing waiting.',
    verifyAction: 'Verify',
    flagAction: 'Flag',
    flagNotePlaceholder: "What didn't match?",
    flagNoteRequired: 'A note is required to flag',
    flagSubmit: 'Submit flag',
    cancel: 'Cancel',
    verifiedNotice: 'Verified.',
    flaggedNotice: 'Flagged.',
    transferArrow: '→',
    dieselTitle: '🚩 Diesel flags',
    dieselSubtitle: "Issued and received litres didn't match.",
    dieselEmpty: 'No diesel mismatches.',
    issuedLabel: 'Issued',
    receivedLabel: 'Received',
    litresUnit: 'L',
    mismatchBadge: 'MISMATCH',
    litresMissing: '—',
    vendorKindPayment: 'Paid to shop',
    vendorKindReceipt: 'Received from shop',
  },
  hi: {
    title: 'अकाउंटेंट डेस्क',
    subtitle: 'आपकी कार्य-सूची — विश्लेषण नहीं, बस तय करें और सत्यापित करें।',
    kpiPending: 'लंबित अनुरोध',
    kpiUnverified: 'आपकी जाँच का इंतज़ार',
    kpiDecidedToday: 'आज (स्वीकृत/अस्वीकृत/सत्यापित)',
    kpiCashInHand: 'हाथ में नकद',
    pendingTitle: 'लंबित पैसे के अनुरोध',
    pendingSubtitle: 'इन्हें Approvals पेज पर तय करें।',
    pendingEmpty: 'कोई लंबित अनुरोध नहीं।',
    viewAllApprovals: 'Approvals पर जाएँ →',
    decideLink: 'तय करें →',
    fromLabel: 'द्वारा',
    unverifiedExpensesTitle: 'खर्च जिनकी जाँच बाकी है',
    unverifiedTransfersTitle: 'कैश ट्रांसफर जिनकी जाँच बाकी है',
    unverifiedVendorTitle: 'दुकान भुगतान जिनकी जाँच बाकी है',
    unverifiedEmpty: 'कुछ भी लंबित नहीं।',
    verifyAction: 'सत्यापित करें',
    flagAction: 'फ़्लैग करें',
    flagNotePlaceholder: 'क्या मेल नहीं खाया?',
    flagNoteRequired: 'फ़्लैग करने के लिए नोट ज़रूरी है',
    flagSubmit: 'फ़्लैग भेजें',
    cancel: 'रद्द करें',
    verifiedNotice: 'सत्यापित हो गया।',
    flaggedNotice: 'फ़्लैग कर दिया।',
    transferArrow: '→',
    dieselTitle: '🚩 डीज़ल फ़्लैग',
    dieselSubtitle: 'दिया गया और मिला डीज़ल मेल नहीं खाया।',
    dieselEmpty: 'कोई डीज़ल मेल-न-खाना नहीं।',
    issuedLabel: 'दिया गया',
    receivedLabel: 'मिला',
    litresUnit: 'लीटर',
    mismatchBadge: 'मेल नहीं खाया',
    litresMissing: '—',
    vendorKindPayment: 'दुकान को दिया',
    vendorKindReceipt: 'दुकान से मिला',
  },
} as const;
type Ui = { [K in keyof typeof UI.en]: string };

export function AccountantDashboardScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();

  const queueQ = useQuery({
    queryKey: ['accountant-queue'],
    queryFn: () => api<AccountantQueue>('GET', '/accountant/queue'),
  });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });

  const nameOf = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? `${id.slice(0, 8)}…`;
  const regNoOf = (id: UUID) => vehiclesQ.data?.find((v) => v.id === id)?.regNo ?? `${id.slice(0, 8)}…`;

  const invalidateQueue = () => void queryClient.invalidateQueries({ queryKey: ['accountant-queue'] });

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
      <MyMoneyCard />

      <Card data-testid="acc-pending-requests">
        <CardHeader>
          <CardTitle>{ui.pendingTitle}</CardTitle>
          <CardDescription>{ui.pendingSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {q.pendingRequests.length === 0 ? (
            <EmptyState label={ui.pendingEmpty} />
          ) : (
            <ShowMore
              items={q.pendingRequests.slice(0, 5)}
              initial={5}
              as="ul"
              className="grid gap-3"
              testIdPrefix="acc-pending"
              renderItem={(r) => (
                <li key={r.id} className="grid gap-1.5 rounded-lg border border-input p-3" data-testid={`acc-pending-row-${r.id}`}>
                  <PayloadSummary type={r.type} payload={r.payload} />
                  <p className="text-xs text-muted-foreground">
                    {ui.fromLabel} {nameOf(r.requestedBy)} · {formatKolkataDateTime(r.createdAt)}
                  </p>
                  <Link href="/accountant/approvals" className="text-sm font-medium text-primary hover:underline" data-testid={`acc-pending-decide-${r.id}`}>
                    {ui.decideLink}
                  </Link>
                </li>
              )}
            />
          )}
          <Link href="/accountant/approvals" className="text-sm font-medium text-primary hover:underline" data-testid="acc-view-all-approvals">
            {ui.viewAllApprovals}
          </Link>
        </CardContent>
      </Card>

      <Card data-testid="acc-unverified-expenses">
        <CardHeader>
          <CardTitle>{ui.unverifiedExpensesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedExpenses.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
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

      <Card data-testid="acc-unverified-transfers">
        <CardHeader>
          <CardTitle>{ui.unverifiedTransfersTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedTransfers.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
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

      <Card data-testid="acc-unverified-vendor-payments">
        <CardHeader>
          <CardTitle>{ui.unverifiedVendorTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.unverifiedVendorPayments.length === 0 ? (
            <EmptyState label={ui.unverifiedEmpty} />
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

      <Card data-testid="acc-diesel-flags">
        <CardHeader>
          <CardTitle>{ui.dieselTitle}</CardTitle>
          <CardDescription>{ui.dieselSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {q.fuelFlags.length === 0 ? (
            <EmptyState label={ui.dieselEmpty} />
          ) : (
            <ul className="divide-y">
              {q.fuelFlags.map((f: FuelMatchFlag, i) => (
                <li key={`${f.vehicleId}-${f.businessDate}-${i}`} className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`acc-diesel-row-${i}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{regNoOf(f.vehicleId)}</span>
                    <span className="inline-block w-fit shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                      {ui.mismatchBadge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatBusinessDate(f.businessDate)} · {ui.issuedLabel}{' '}
                    {f.issuedLitres === null ? ui.litresMissing : `${f.issuedLitres} ${ui.litresUnit}`} / {ui.receivedLabel}{' '}
                    {f.receivedLitres === null ? ui.litresMissing : `${f.receivedLitres} ${ui.litresUnit}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
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

/** One "awaiting tick" row: ✓ verify or 🚩 flag (required note), shared shape across the
 * three money surfaces that never went through a request (expense / cash-transfer / vendor payment). */
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
