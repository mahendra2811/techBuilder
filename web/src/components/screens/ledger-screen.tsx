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
 *       falling back to a shortened id for out-of-scope users. Each row shows
 *       a <TagBadge> next to the kind chip (renders nothing for a WORK-tagged
 *       transfer).
 *   (c) Rollup — GET /ledger/rollup, rendered ONLY for OWNER and SITE_MANAGER
 *       (the API 403s for SUPERVISOR/ACCOUNTANT): per-person balance + received/
 *       given/spent + ₹-per-category chips — the "where did my one lakh go" view.
 *
 * Round 2 (CW-3): the ACCOUNTANT variant — his own khata + give/return-cash form
 * work exactly like the SM's (rank 4, giving down to SITE_MANAGER/SUPERVISOR/
 * DRIVER/WORKER — see backend balance-calc.ts ROLE_RANK + cash-transfers.service.ts),
 * and the rollup stays hidden (server-side 403 for non-SM/Owner).
 *
 * Round 2 tag picker (`CreateCashTransferInput.tag`, OWNER + ACCOUNTANT only): a
 * WORK / SALARY / PERSONAL toggle rendered above the kind toggle. WORK (the
 * default, sent as "no tag" — server defaults it) is an ordinary khata advance
 * counted in the recipient's balance. SALARY/PERSONAL is always a GIVE (the
 * server rejects RETURN for a non-WORK tag) and only surfaces on the
 * recipient's Profile / "money I've taken" list once the accountant ticks it
 * — while a non-WORK tag is selected the kind toggle is hidden and locked to
 * GIVE. SITE_MANAGER and SUPERVISOR never see the tag picker and never send a
 * tag at all.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type { CashTransfer, CashTransferKind, CreateCashTransferInput, LedgerRollupRow, MoneyTag, UUID, User } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { apiErrorOf } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ShowMore } from '@/components/ui/show-more';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { FormStatus } from '@/components/entry/form-status';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { candidateRoles, type MoneyGiverRole } from '@/components/khata/target-roles';
import { resolveUserName } from '@/components/khata/resolve-user-name';
import { TransferRow } from '@/components/khata/transfer-row';
import { RollupRows } from '@/components/khata/rollup-rows';

type LedgerRole = MoneyGiverRole;

// Module-local — the frozen LEDGER_UI catalog predates the Round 2 tag picker
// (OWNER + ACCOUNTANT only) and the <TagBadge> on history rows.
const TAG_PICKER_UI = {
  en: {
    label: 'What is this for?',
    tagWork: 'Work cash',
    tagSalary: 'Salary',
    tagPersonal: 'Personal',
    hint: 'Work cash counts in the khata. Salary/Personal shows on the person’s Profile only after the accountant’s tick.',
    lockedToGive: 'Salary/Personal draws are always a "give" — return doesn’t apply here.',
  },
  hi: {
    label: 'यह किसके लिए है?',
    tagWork: 'काम का पैसा',
    tagSalary: 'वेतन',
    tagPersonal: 'निजी',
    hint: 'काम का पैसा खाते में गिना जाता है। वेतन/निजी अकाउंटेंट की पुष्टि के बाद ही व्यक्ति की प्रोफ़ाइल पर दिखता है।',
    lockedToGive: 'वेतन/निजी रक़म हमेशा "देना" ही होती है — यहां वापसी लागू नहीं होती।',
  },
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
  const [tag, setTag] = useState<MoneyTag>('WORK');
  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [personError, setPersonError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Round 2: only OWNER/ACCOUNTANT may tag a transfer SALARY/PERSONAL (server
  // rules: tag ≠ WORK ⇒ giver must be OWNER/SITE_MANAGER/ACCOUNTANT). SM/SUPERVISOR
  // stay WORK-only — no picker, no tag sent.
  const showTagPicker = role === 'OWNER' || role === 'ACCOUNTANT';

  const handleTagChange = (next: MoneyTag) => {
    setTag(next);
    // Non-WORK draws are always a GIVE — the server rejects RETURN otherwise.
    if (next !== 'WORK') setKind('GIVE');
  };

  const candidates = useMemo(() => {
    const roles = candidateRoles(role, tag);
    return (usersQ.data ?? []).filter((u) => u.active && roles.includes(u.role));
  }, [usersQ.data, role, tag]);

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
      setTag('WORK');
      void queryClient.invalidateQueries({ queryKey: ['me', 'balance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger-rollup'] });
      void queryClient.invalidateQueries({ queryKey: ['my-money'] });
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
    // Non-WORK draws are always a GIVE server-side — enforce it here too even
    // though the toggle is hidden/locked while tag !== 'WORK'.
    const effectiveKind: CashTransferKind = tag === 'WORK' ? kind : 'GIVE';
    create.mutate({
      id: uuidv7(),
      toUserId,
      amountPaise,
      kind: effectiveKind,
      businessDate: date,
      ...(tag !== 'WORK' ? { tag } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  const serverError =
    apiErrorOf(m, create.error);

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
        ) : candidates.length === 0 ? (
          <EmptyState label={m.LEDGER_UI.noPeople} />
        ) : (
          <form className="grid gap-4" noValidate onSubmit={onSubmit}>
            {showTagPicker && (
              <div className="grid gap-2">
                <Label>{TAG_PICKER_UI[locale].label}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={tag === 'WORK' ? 'default' : 'outline'}
                    data-testid="transfer-tag-WORK"
                    aria-pressed={tag === 'WORK'}
                    onClick={() => handleTagChange('WORK')}
                  >
                    {TAG_PICKER_UI[locale].tagWork}
                  </Button>
                  <Button
                    type="button"
                    variant={tag === 'SALARY' ? 'default' : 'outline'}
                    data-testid="transfer-tag-SALARY"
                    aria-pressed={tag === 'SALARY'}
                    onClick={() => handleTagChange('SALARY')}
                  >
                    {TAG_PICKER_UI[locale].tagSalary}
                  </Button>
                  <Button
                    type="button"
                    variant={tag === 'PERSONAL' ? 'default' : 'outline'}
                    data-testid="transfer-tag-PERSONAL"
                    aria-pressed={tag === 'PERSONAL'}
                    onClick={() => handleTagChange('PERSONAL')}
                  >
                    {TAG_PICKER_UI[locale].tagPersonal}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{TAG_PICKER_UI[locale].hint}</p>
              </div>
            )}

            {tag === 'WORK' ? (
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
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="transfer-kind-locked-give">
                {m.LEDGER_UI.kindGive} — {TAG_PICKER_UI[locale].lockedToGive}
              </p>
            )}

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

                          <FormStatus error={serverError} saved={saved} savedLabel={m.LEDGER_UI.saved} testIdPrefix="transfer" />

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

function TransfersHistory({ usersQ }: { usersQ: ReturnType<typeof useQuery<User[]>> }) {
  const m = useMessages();
  const locale = useLocale();
  const transfersQ = useQuery({
    queryKey: ['cash-transfers'],
    queryFn: () => api<CashTransfer[]>('GET', '/cash-transfers'),
  });
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const userName = (id: UUID) => resolveUserName(id, usersQ.data, meQ.data);

  return (
    <Card data-testid="cash-transfers-history">
      <CardHeader>
        <CardTitle>{m.LEDGER_UI.historyTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={transfersQ} emptyLabel={m.LEDGER_UI.historyEmpty}>
          {(transfers) => (
            <ShowMore
              items={transfers}
              initial={10}
              as="ul"
              className="divide-y"
              testIdPrefix="cash-transfers-history"
              renderItem={(t) => (
                <TransferRow
                  key={t.id}
                  t={t}
                  userName={userName}
                  rowTestIdPrefix="transfer-row"
                  kindChipTestIdPrefix="transfer-kind-chip"
                  tagLabels={TAG_PICKER_UI[locale]}
                />
              )}
            />
          )}
        </QueryBoundary>
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
        <QueryBoundary query={rollupQ} emptyLabel={m.LEDGER_UI.rollupEmpty}>
          {(rows) => <RollupRows rows={rows} testIdPrefix="rollup" />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
