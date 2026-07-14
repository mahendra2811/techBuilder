'use client';

/**
 * Cash ledger — money khata (WO-9-UI). Owner / Site-Manager / Supervisor screen:
 *   (a) "Give / receive-back money" form — POST /cash-transfers. Person select
 *       from GET /users (already scoped server-side), filtered CLIENT-side to
 *       roles BELOW the caller (Owner→SM/Supervisor/DRIVER/WORKER, SM→Supervisor/DRIVER/WORKER,
 *       Supervisor→WORKER — mirrors the backend's GIVE hierarchy check). Kind toggle:
 *       GIVE ("gave money") or RETURN ("received back" — the senior records
 *       that the junior returned cash TO him; stored junior→senior server-side,
 *       so toUserId is ALWAYS the selected junior for both kinds).
 *   (b) Transfers history — GET /cash-transfers (own transfers; SM also his
 *       site's; Owner all), names resolved via the /users list (self via /me),
 *       falling back to a shortened id for out-of-scope users.
 *   (c) Rollup — GET /ledger/rollup, rendered ONLY for OWNER and SITE_MANAGER
 *       (the API 403s for SUPERVISOR/ACCOUNTANT): per-person balance + received/
 *       given/spent + ₹-per-category chips — the "where did my one lakh go" view.
 *
 * Round 2 (CW-3): the ACCOUNTANT variant — his own khata + give/return-cash form
 * work exactly like the SM's (rank 4, giving down to SITE_MANAGER/SUPERVISOR/
 * DRIVER/WORKER — see backend balance-calc.ts ROLE_RANK + cash-transfers.service.ts),
 * and the rollup stays hidden (server-side 403 for non-SM/Owner). KNOWN GAP: the
 * recipient picker sources GET /users, which for ACCOUNTANT currently returns only
 * himself (no ACCOUNTANT branch in backend UsersService.list — falls to self-only,
 * same gap noted on the approvals screen) — so `candidates` filters to empty and
 * the give/return form shows a "coming soon" note instead (see TransferForm below),
 * even though the backend would otherwise allow the transfer. Not fixed here
 * (backend/**), flagged in the CW-3 handoff.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type {
  CashTransfer,
  CashTransferKind,
  CreateCashTransferInput,
  LedgerRollupRow,
  Role,
  UUID,
  User,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, formatSignedPaise, rupeesToPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ShowMore } from '@/components/ui/show-more';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

type LedgerRole = Extract<Role, 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR' | 'ACCOUNTANT'>;

/** Roles BELOW each caller — who they may hand cash to (mirrors the backend). */
const TARGET_ROLES: Record<LedgerRole, readonly Role[]> = {
  OWNER: ['SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'],
  SITE_MANAGER: ['SUPERVISOR', 'DRIVER', 'WORKER'],
  SUPERVISOR: ['WORKER'],
  ACCOUNTANT: ['SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'],
};

// Module-local — the frozen LEDGER_UI catalog predates the ACCOUNTANT variant's
// "recipients not reachable yet" note (see the backend-gap comment above).
const COMING_SOON_UI = {
  en: 'Giving/returning cash from here is coming soon.',
  hi: 'यहाँ से पैसे देना/वापस लेना जल्द आ रहा है।',
} as const;

export function LedgerScreen({ role }: { role: LedgerRole }) {
  const m = useMessages();
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  return (
    <div className="grid gap-4" data-testid="ledger-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.LEDGER_UI.title}</CardTitle>
          <CardDescription>{m.LEDGER_UI.subtitle}</CardDescription>
        </CardHeader>
      </Card>

      <TransferForm role={role} usersQ={usersQ} />
      <TransfersHistory usersQ={usersQ} />
      {role !== 'SUPERVISOR' && role !== 'ACCOUNTANT' && <RollupSection />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) Give / receive-back money
// ---------------------------------------------------------------------------

function TransferForm({ role, usersQ }: { role: LedgerRole; usersQ: ReturnType<typeof useQuery<User[]>> }) {
  const m = useMessages();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const [toUserId, setToUserId] = useState<UUID | ''>('');
  const [kind, setKind] = useState<CashTransferKind>('GIVE');
  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [personError, setPersonError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const candidates = useMemo(
    () => (usersQ.data ?? []).filter((u) => u.active && TARGET_ROLES[role].includes(u.role)),
    [usersQ.data, role],
  );

  const amountPaise = (() => {
    const n = Number(amountRupees);
    return Number.isFinite(n) && n > 0 ? rupeesToPaise(n) : 0;
  })();

  const create = useMutation({
    mutationFn: (input: CreateCashTransferInput) => api<CashTransfer>('POST', '/cash-transfers', input),
    onSuccess: () => {
      setSaved(true);
      setToUserId('');
      setAmountRupees('');
      setDate(today);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['me', 'balance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger-rollup'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    let bad = false;
    if (!toUserId) {
      setPersonError(m.LEDGER_UI.personRequired);
      bad = true;
    } else {
      setPersonError(null);
    }
    if (!(amountPaise > 0)) {
      setAmountError(m.LEDGER_UI.amountInvalid);
      bad = true;
    } else {
      setAmountError(null);
    }
    if (bad || !toUserId) return;
    create.mutate({
      id: uuidv7(),
      toUserId,
      amountPaise,
      kind,
      businessDate: date,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="cash-transfer-form">
      <CardHeader>
        <CardTitle>{m.LEDGER_UI.formTitle}</CardTitle>
        <CardDescription>{m.LEDGER_UI.formSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {usersQ.isPending ? (
          <LoadingState />
        ) : usersQ.error ? (
          <ErrorState error={usersQ.error} onRetry={() => void usersQ.refetch()} />
        ) : candidates.length === 0 && role === 'ACCOUNTANT' ? (
          // Backend gap (see file header): GET /users returns only himself for ACCOUNTANT,
          // so `candidates` always filters to empty — a distinct note, not the generic
          // "no people" copy, since the reason isn't that no one exists.
          <EmptyState label={COMING_SOON_UI[locale]} />
        ) : candidates.length === 0 ? (
          <EmptyState label={m.LEDGER_UI.noPeople} />
        ) : (
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label>{m.LEDGER_UI.kindLabel}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={kind === 'GIVE' ? 'default' : 'outline'}
                  data-testid="transfer-kind-give"
                  aria-pressed={kind === 'GIVE'}
                  onClick={() => setKind('GIVE')}
                >
                  {m.LEDGER_UI.kindGive}
                </Button>
                <Button
                  type="button"
                  variant={kind === 'RETURN' ? 'default' : 'outline'}
                  data-testid="transfer-kind-return"
                  aria-pressed={kind === 'RETURN'}
                  onClick={() => setKind('RETURN')}
                >
                  {m.LEDGER_UI.kindReturn}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {kind === 'GIVE' ? m.LEDGER_UI.kindGiveHint : m.LEDGER_UI.kindReturnHint}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transfer-person">{m.LEDGER_UI.personLabel}</Label>
              <NativeSelect
                id="transfer-person"
                data-testid="transfer-person"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
              >
                <option value="">{m.LEDGER_UI.selectPerson}</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({m.ROLE_LABELS[u.role]})
                  </option>
                ))}
              </NativeSelect>
              {personError && (
                <p className="text-sm text-destructive" role="alert">
                  {personError}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transfer-amount">{m.LEDGER_UI.amountLabel}</Label>
              <Input
                id="transfer-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="transfer-amount"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
              {amountError && (
                <p className="text-sm text-destructive" role="alert">
                  {amountError}
                </p>
              )}
            </div>

            <DateField id="transfer-date" testId="transfer-date" value={date} onChange={setDate} max={today} />

            <div className="grid gap-2">
              <Label htmlFor="transfer-note">{m.LEDGER_UI.noteLabel}</Label>
              <Input id="transfer-note" data-testid="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {serverError && (
              <Notice tone="error" testId="transfer-error">
                {serverError}
              </Notice>
            )}
            {saved && (
              <Notice tone="success" testId="transfer-saved">
                {m.LEDGER_UI.saved}
              </Notice>
            )}

            <Button type="submit" data-testid="transfer-submit" disabled={create.isPending}>
              {create.isPending ? m.LEDGER_UI.submitting : m.LEDGER_UI.submit}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (b) Transfers history
// ---------------------------------------------------------------------------

function KindChip({ kind }: { kind: CashTransferKind }) {
  const m = useMessages();
  return (
    <span
      data-testid={`transfer-kind-chip-${kind}`}
      className={cn(
        'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        kind === 'GIVE'
          ? 'bg-primary/10 text-primary'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      )}
    >
      {kind === 'GIVE' ? m.LEDGER_UI.kindChipGive : m.LEDGER_UI.kindChipReturn}
    </span>
  );
}

function TransfersHistory({ usersQ }: { usersQ: ReturnType<typeof useQuery<User[]>> }) {
  const m = useMessages();
  const transfersQ = useQuery({
    queryKey: ['cash-transfers'],
    queryFn: () => api<CashTransfer[]>('GET', '/cash-transfers'),
  });
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });

  // Best-effort name resolution: /users list → self (/me) → shortened id
  // (a transfer row may reference a user outside the caller's /users scope).
  const userName = (id: UUID): string => {
    const listed = usersQ.data?.find((u) => u.id === id)?.name;
    if (listed) return listed;
    if (meQ.data?.user.id === id) return meQ.data.user.name;
    return `${id.slice(0, 8)}…`;
  };

  return (
    <Card data-testid="cash-transfers-history">
      <CardHeader>
        <CardTitle>{m.LEDGER_UI.historyTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {transfersQ.isPending ? (
          <LoadingState />
        ) : transfersQ.error ? (
          <ErrorState error={transfersQ.error} onRetry={() => void transfersQ.refetch()} />
        ) : !transfersQ.data || transfersQ.data.length === 0 ? (
          <EmptyState label={m.LEDGER_UI.historyEmpty} />
        ) : (
          <ShowMore
            items={transfersQ.data}
            initial={10}
            as="ul"
            className="divide-y"
            testIdPrefix="cash-transfers-history"
            renderItem={(t) => (
              <li key={t.id} className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`transfer-row-${t.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {userName(t.fromUserId)} → {userName(t.toUserId)}
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</p>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <KindChip kind={t.kind} />
                  <span>{t.businessDate}</span>
                  {t.note && <span className="min-w-0 truncate">· {t.note}</span>}
                </p>
              </li>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (c) Rollup — Owner + Site Manager only (the API 403s for Team Head)
// ---------------------------------------------------------------------------

function RollupSection() {
  const m = useMessages();
  const rollupQ = useQuery({
    queryKey: ['ledger-rollup'],
    queryFn: () => api<LedgerRollupRow[]>('GET', '/ledger/rollup'),
  });

  return (
    <Card data-testid="ledger-rollup">
      <CardHeader>
        <CardTitle>{m.LEDGER_UI.rollupTitle}</CardTitle>
        <CardDescription>{m.LEDGER_UI.rollupSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {rollupQ.isPending ? (
          <LoadingState />
        ) : rollupQ.error ? (
          <ErrorState error={rollupQ.error} onRetry={() => void rollupQ.refetch()} />
        ) : !rollupQ.data || rollupQ.data.length === 0 ? (
          <EmptyState label={m.LEDGER_UI.rollupEmpty} />
        ) : (
          <ul className="divide-y">
            {rollupQ.data.map((row) => (
              <li key={row.userId} className="grid gap-2 py-3 first:pt-0 last:pb-0" data-testid={`rollup-row-${row.userId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {row.name}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{m.ROLE_LABELS[row.role]}</span>
                  </p>
                  <p
                    className={cn('shrink-0 text-sm font-bold tabular-nums', row.balancePaise < 0 && 'text-destructive')}
                    data-testid={`rollup-balance-${row.userId}`}
                  >
                    {formatSignedPaise(row.balancePaise)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.LEDGER_UI.rollupReceived} {formatPaise(row.receivedPaise)} · {m.LEDGER_UI.rollupGiven}{' '}
                  {formatPaise(row.givenPaise)} · {m.LEDGER_UI.rollupSpent} {formatPaise(row.spentPaise)}
                </p>
                <ByCategoryChips byCategory={row.byCategory} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ByCategoryChips({ byCategory }: { byCategory: LedgerRollupRow['byCategory'] }) {
  const m = useMessages();
  // Frozen enum order keeps the chips stable regardless of server key order.
  const chips = EXPENSE_CATEGORIES.map((c) => ({ category: c, paise: byCategory[c] })).filter(
    (x): x is { category: (typeof EXPENSE_CATEGORIES)[number]; paise: number } => x.paise !== undefined && x.paise > 0,
  );
  if (chips.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-1">
      {chips.map(({ category, paise }) => (
        <span
          key={category}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
          data-testid={`rollup-cat-${category}`}
        >
          {m.EXPENSE_CATEGORY_LABELS[category]} {formatPaise(paise)}
        </span>
      ))}
    </p>
  );
}
