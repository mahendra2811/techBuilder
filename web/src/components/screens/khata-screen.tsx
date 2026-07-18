'use client';

/**
 * Accountant + Site-Manager khata hub (ACC-2/ACC-3, COMBINED-BUILD-PLAN.md §4,
 * contracts `frozen.10`). Replaces the combined `<LedgerScreen>` on the
 * `/accountant/ledger` and `/site-manager/ledger` routes for these two roles
 * (the Owner keeps his existing combined form + tag toggle untouched — D8).
 *
 * Landing view = 4 tappable section cards (vendors-screen list→detail style,
 * `useSubPage`), each its own sub-page:
 *   a. Give money (work cash)   — GIVE, tag omitted (server defaults WORK).
 *   b. Receive money (work cash) — RETURN, WORK only (nobody "returns" salary).
 *   c. Give salary               — ACCOUNTANT ONLY. Always GIVE, tag SALARY
 *      (client decision: SALARY/PERSONAL show as one "Salary/Personal" choice
 *      in the UI but this page always WRITES tag=SALARY; PERSONAL stays valid
 *      only for pre-existing rows, which the history here still displays).
 *   d. Who holds what            — `GET /ledger/rollup`, now allowed for both
 *      ACCOUNTANT (site-scoped) and SITE_MANAGER.
 *
 * Each of a/b/c is "form first" — its history sits behind a `LazyHistorySection`
 * (last ~40 entries), with a "View all →" into a shared full-history sub-page
 * (date-range + person filters, `ShowMore`-paced render) once 40 come back.
 * The rollup (d) is ALSO gated behind a `LazyHistorySection` per spec (no eager
 * fetch just from opening the sub-page — same "tap to reveal" khata style as
 * the dashboard eye-toggle).
 *
 * `GET /cash-transfers` gained `tag`/`kind` query params in frozen.10
 * (additive, `ENDPOINTS` unchanged) precisely so each sub-page can ask the
 * server for only its own slice instead of client-filtering everything.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type {
  CashTransfer,
  CashTransferKind,
  CreateCashTransferInput,
  LedgerRollupRow,
  MoneyTag,
  Role,
  UUID,
  User,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { todayKolkata, addDays } from '@/lib/business-date';
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
import { TagBadge } from '@/components/my-money-card';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { LazyHistorySection, useLazySection } from '@/components/ui/lazy-history';
import { DatePresets, type DateRange } from '@/components/insights/date-presets';

export type KhataRole = 'ACCOUNTANT' | 'SITE_MANAGER';
type Slice = 'give' | 'receive' | 'salary';
type SectionKey = Slice | 'rollup';

/** Roles BELOW each caller — who they may hand cash to (mirrors ledger-screen's TARGET_ROLES). */
const TARGET_ROLES: Record<KhataRole, readonly Role[]> = {
  ACCOUNTANT: ['SITE_MANAGER', 'SUPERVISOR', 'DRIVER', 'WORKER'],
  SITE_MANAGER: ['SUPERVISOR', 'DRIVER', 'WORKER'],
};

// Module-local bilingual UI (per convention — the frozen message catalogs
// predate this 3-sub-page + rollup split; generic bits like person/amount/note
// labels still come from `m.LEDGER_UI`).
const UI = {
  en: {
    hubTitle: 'Khata',
    hubSubtitle: 'Give and receive work cash, pay salary, and see who holds what.',
    give: { title: 'Give money (work cash)', subtitle: 'Hand cash down for site work.' },
    receive: { title: 'Receive money (work cash)', subtitle: 'Record cash returned to you.' },
    salary: { title: 'Give salary', subtitle: 'Pay salary / personal money to anyone under you.' },
    rollup: { title: 'Who holds what', subtitle: "Each person's work-cash balance (salary excluded)." },
    salaryHint: 'Shows on the person’s Profile as money taken from the office. Your own entries are auto-verified.',
    historyTitle: 'History',
    historyEmpty: 'No entries yet.',
    viewAll: 'View all →',
    viewAllTitle: 'All entries',
    personFilterLabel: 'Person',
    everyone: 'Everyone',
    historyEmptyFull: 'No entries in this range.',
  },
  hi: {
    hubTitle: 'खाता',
    hubSubtitle: 'काम का पैसा देना/लेना, वेतन देना, और देखें किसके पास कितना है।',
    give: { title: 'पैसा देना (काम का पैसा)', subtitle: 'साइट के काम के लिए पैसा दें।' },
    receive: { title: 'पैसा वापस लेना (काम का पैसा)', subtitle: 'आपको वापस मिला पैसा दर्ज करें।' },
    salary: { title: 'वेतन देना', subtitle: 'आपके अधीन किसी को वेतन/निजी पैसा दें।' },
    rollup: { title: 'किसके पास कितना', subtitle: 'हर व्यक्ति का काम-पैसे का हिसाब (वेतन शामिल नहीं)।' },
    salaryHint: 'यह व्यक्ति की प्रोफ़ाइल पर डफ़्तर/ऑफ़िस से लिया गया पैसा दिखेगा। आपकी अपनी प्रविष्टियां खुद-ब-खुद सत्यापित हो जाती हैं।',
    historyTitle: 'इतिहास',
    historyEmpty: 'अभी तक कोई प्रविष्टि नहीं।',
    viewAll: 'सभी देखें →',
    viewAllTitle: 'सभी प्रविष्टियां',
    personFilterLabel: 'व्यक्ति',
    everyone: 'सभी',
    historyEmptyFull: 'इस समय-सीमा में कोई प्रविष्टि नहीं।',
  },
} as const;

// Small tag-label pair for <TagBadge> (mirrors ledger-screen's TAG_PICKER_UI subset).
const TAG_LABELS = {
  en: { tagSalary: 'Salary', tagPersonal: 'Personal' },
  hi: { tagSalary: 'वेतन', tagPersonal: 'निजी' },
} as const;

type UsersQuery = ReturnType<typeof useQuery<User[]>>;

export function KhataScreen({ role }: { role: KhataRole }) {
  const locale = useLocale();
  const ui = UI[locale];
  const { current, open, close } = useSubPage<SectionKey>();
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  if (current === 'give') {
    return (
      <MoneySection
        slice="give"
        kind="GIVE"
        tag="WORK"
        role={role}
        usersQ={usersQ}
        title={ui.give.title}
        subtitle={ui.give.subtitle}
        onClose={close}
      />
    );
  }
  if (current === 'receive') {
    return (
      <MoneySection
        slice="receive"
        kind="RETURN"
        tag="WORK"
        role={role}
        usersQ={usersQ}
        title={ui.receive.title}
        subtitle={ui.receive.subtitle}
        onClose={close}
      />
    );
  }
  if (current === 'salary') {
    return (
      <MoneySection
        slice="salary"
        kind="GIVE"
        tag="SALARY"
        role={role}
        usersQ={usersQ}
        title={ui.salary.title}
        subtitle={ui.salary.subtitle}
        hint={ui.salaryHint}
        onClose={close}
      />
    );
  }
  if (current === 'rollup') {
    return <RollupSubPage title={ui.rollup.title} subtitle={ui.rollup.subtitle} onClose={close} />;
  }

  return (
    <div className="grid gap-4" data-testid="khata-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.hubTitle}</CardTitle>
          <CardDescription>{ui.hubSubtitle}</CardDescription>
        </CardHeader>
      </Card>

      <SectionCard testId="khata-section-give" title={ui.give.title} subtitle={ui.give.subtitle} onOpen={() => open('give')} />
      <SectionCard
        testId="khata-section-receive"
        title={ui.receive.title}
        subtitle={ui.receive.subtitle}
        onOpen={() => open('receive')}
      />
      {role === 'ACCOUNTANT' && (
        <SectionCard
          testId="khata-section-salary"
          title={ui.salary.title}
          subtitle={ui.salary.subtitle}
          onOpen={() => open('salary')}
        />
      )}
      <SectionCard testId="khata-section-rollup" title={ui.rollup.title} subtitle={ui.rollup.subtitle} onOpen={() => open('rollup')} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing view — tappable section card
// ---------------------------------------------------------------------------

function SectionCard({
  testId,
  title,
  subtitle,
  onOpen,
}: {
  testId: string;
  title: string;
  subtitle: string;
  onOpen: () => void;
}) {
  return (
    <Card data-testid={testId}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        data-testid={`${testId}-open`}
        onClick={onOpen}
      >
        <span className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// a/b/c — Give (work) / Receive (work) / Give salary — shared shape
// ---------------------------------------------------------------------------

function MoneySection({
  slice,
  kind,
  tag,
  role,
  usersQ,
  title,
  subtitle,
  hint,
  onClose,
}: {
  slice: Slice;
  kind: CashTransferKind;
  tag: MoneyTag;
  role: KhataRole;
  usersQ: UsersQuery;
  title: string;
  subtitle: string;
  hint?: string;
  onClose: () => void;
}) {
  const [viewFull, setViewFull] = useState(false);

  if (viewFull) {
    return <FullHistoryPage slice={slice} usersQ={usersQ} onBack={() => setViewFull(false)} />;
  }

  return (
    <div className="grid gap-4" data-testid={`khata-${slice}-section`}>
      <SubPageHeader title={title} onBack={onClose} />
      <MoneyForm
        usersQ={usersQ}
        role={role}
        kind={kind}
        tag={tag}
        slice={slice}
        formTitle={title}
        formSubtitle={subtitle}
        hint={hint}
      />
      <SliceHistory slice={slice} usersQ={usersQ} onViewAll={() => setViewFull(true)} />
    </div>
  );
}

function MoneyForm({
  usersQ,
  role,
  kind,
  tag,
  slice,
  formTitle,
  formSubtitle,
  hint,
}: {
  usersQ: UsersQuery;
  role: KhataRole;
  kind: CashTransferKind;
  tag: MoneyTag;
  slice: Slice;
  formTitle: string;
  formSubtitle: string;
  hint?: string;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const testIdPrefix = `khata-${slice}`;

  const [toUserId, setToUserId] = useState<UUID | ''>('');
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
      void queryClient.invalidateQueries({ queryKey: ['my-money'] });
      void queryClient.invalidateQueries({ queryKey: ['khata-history', slice] });
      void queryClient.invalidateQueries({ queryKey: ['khata-history-full', slice] });
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
      ...(tag !== 'WORK' ? { tag } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid={`${testIdPrefix}-form`}>
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
        <CardDescription>{formSubtitle}</CardDescription>
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
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

            <div className="grid gap-2">
              <Label htmlFor={`${testIdPrefix}-person`}>{m.LEDGER_UI.personLabel}</Label>
              <NativeSelect
                id={`${testIdPrefix}-person`}
                data-testid={`${testIdPrefix}-person`}
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
              <Label htmlFor={`${testIdPrefix}-amount`}>{m.LEDGER_UI.amountLabel}</Label>
              <Input
                id={`${testIdPrefix}-amount`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid={`${testIdPrefix}-amount`}
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
              {amountError && (
                <p className="text-sm text-destructive" role="alert">
                  {amountError}
                </p>
              )}
            </div>

            <DateField id={`${testIdPrefix}-date`} testId={`${testIdPrefix}-date`} value={date} onChange={setDate} max={today} />

            <div className="grid gap-2">
              <Label htmlFor={`${testIdPrefix}-note`}>{m.LEDGER_UI.noteLabel}</Label>
              <Input
                id={`${testIdPrefix}-note`}
                data-testid={`${testIdPrefix}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {serverError && (
              <Notice tone="error" testId={`${testIdPrefix}-error`}>
                {serverError}
              </Notice>
            )}
            {saved && (
              <Notice tone="success" testId={`${testIdPrefix}-saved`}>
                {m.LEDGER_UI.saved}
              </Notice>
            )}

            <Button type="submit" data-testid={`${testIdPrefix}-submit`} disabled={create.isPending}>
              {create.isPending ? m.LEDGER_UI.submitting : m.LEDGER_UI.submit}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared history fetch — one tag/kind slice, optionally date-windowed
// ---------------------------------------------------------------------------

interface SliceHistoryResult {
  items: CashTransfer[];
  /** True when at least one underlying fetch hit its `limit` — more rows may exist server-side. */
  maybeMore: boolean;
}

async function fetchSliceHistory(slice: Slice, opts: { limit: number; from?: string; to?: string }): Promise<SliceHistoryResult> {
  const base = new URLSearchParams();
  base.set('limit', String(opts.limit));
  if (opts.from) base.set('from', opts.from);
  if (opts.to) base.set('to', opts.to);

  const fetchTag = (tag?: MoneyTag, kind?: CashTransferKind) => {
    const params = new URLSearchParams(base);
    if (tag) params.set('tag', tag);
    if (kind) params.set('kind', kind);
    return api<CashTransfer[]>('GET', `/cash-transfers?${params.toString()}`);
  };

  if (slice === 'give') {
    const items = await fetchTag('WORK', 'GIVE');
    return { items, maybeMore: items.length >= opts.limit };
  }
  if (slice === 'receive') {
    const items = await fetchTag('WORK', 'RETURN');
    return { items, maybeMore: items.length >= opts.limit };
  }
  // salary: SALARY (this page's writes) + PERSONAL (pre-existing rows only) merged, newest first.
  const [salary, personal] = await Promise.all([fetchTag('SALARY'), fetchTag('PERSONAL')]);
  const items = [...salary, ...personal].sort((a, b) =>
    a.businessDate < b.businessDate ? 1 : a.businessDate > b.businessDate ? -1 : 0,
  );
  return { items, maybeMore: salary.length >= opts.limit || personal.length >= opts.limit };
}

function resolveUserName(id: UUID, users: User[] | undefined, mePayload: { user: User } | undefined): string {
  const listed = users?.find((u) => u.id === id)?.name;
  if (listed) return listed;
  if (mePayload?.user.id === id) return mePayload.user.name;
  return `${id.slice(0, 8)}…`;
}

function KindChip({ kind }: { kind: CashTransferKind }) {
  const m = useMessages();
  return (
    <span
      data-testid={`khata-kind-chip-${kind}`}
      className={cn(
        'inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
        kind === 'GIVE' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
      )}
    >
      {kind === 'GIVE' ? m.LEDGER_UI.kindChipGive : m.LEDGER_UI.kindChipReturn}
    </span>
  );
}

function TransferRow({ t, userName }: { t: CashTransfer; userName: (id: UUID) => string }) {
  const locale = useLocale();
  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`khata-transfer-row-${t.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {userName(t.fromUserId)} → {userName(t.toUserId)}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatPaise(t.amountPaise)}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <KindChip kind={t.kind} />
        <TagBadge tag={t.tag} ui={TAG_LABELS[locale]} />
        <span>{t.businessDate}</span>
        {t.note && <span className="min-w-0 truncate">· {t.note}</span>}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Lazy "last ~40" history behind the form, with a "View all" escape hatch
// ---------------------------------------------------------------------------

function SliceHistory({ slice, usersQ, onViewAll }: { slice: Slice; usersQ: UsersQuery; onViewAll: () => void }) {
  const locale = useLocale();
  const ui = UI[locale];
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const { shown, show } = useLazySection();
  const historyQ = useQuery({
    queryKey: ['khata-history', slice],
    queryFn: () => fetchSliceHistory(slice, { limit: 40 }),
    enabled: shown,
  });
  const userName = (id: UUID) => resolveUserName(id, usersQ.data, meQ.data);

  return (
    <Card data-testid={`khata-${slice}-history`}>
      <CardContent className="pt-4">
        <LazyHistorySection
          title={ui.historyTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={() => void historyQ.refetch()}
          refreshing={historyQ.isFetching}
          testId={`khata-${slice}-lazy-history`}
        >
          {historyQ.isPending ? (
            <LoadingState />
          ) : historyQ.error ? (
            <ErrorState error={historyQ.error} onRetry={() => void historyQ.refetch()} />
          ) : !historyQ.data || historyQ.data.items.length === 0 ? (
            <EmptyState label={ui.historyEmpty} />
          ) : (
            <div className="grid gap-3">
              <ul className="divide-y">
                {historyQ.data.items.map((t) => (
                  <TransferRow key={t.id} t={t} userName={userName} />
                ))}
              </ul>
              {historyQ.data.maybeMore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  data-testid={`khata-${slice}-view-all`}
                  onClick={onViewAll}
                >
                  {ui.viewAll}
                </Button>
              )}
            </div>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Full-history sub-page (shared by give/receive/salary "View all")
// ---------------------------------------------------------------------------

function FullHistoryPage({ slice, usersQ, onBack }: { slice: Slice; usersQ: UsersQuery; onBack: () => void }) {
  const locale = useLocale();
  const ui = UI[locale];
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const today = useMemo(() => todayKolkata(), []);
  const [range, setRange] = useState<DateRange>({ from: addDays(today, -6), to: today });
  const [personId, setPersonId] = useState<UUID | ''>('');

  const historyQ = useQuery({
    queryKey: ['khata-history-full', slice, range.from, range.to],
    queryFn: () => fetchSliceHistory(slice, { limit: 5000, from: range.from, to: range.to }),
  });

  const filtered = useMemo(() => {
    const items = historyQ.data?.items ?? [];
    if (!personId) return items;
    return items.filter((t) => t.fromUserId === personId || t.toUserId === personId);
  }, [historyQ.data, personId]);

  const userName = (id: UUID) => resolveUserName(id, usersQ.data, meQ.data);

  return (
    <div className="grid gap-4" data-testid={`khata-full-history-${slice}`}>
      <SubPageHeader title={ui.viewAllTitle} onBack={onBack} />

      <Card>
        <CardContent className="grid gap-4 pt-4">
          <DatePresets today={today} value={range} onChange={setRange} testIdPrefix={`khata-full-${slice}-date`} />
          <div className="grid gap-2">
            <Label htmlFor={`khata-full-${slice}-person`}>{ui.personFilterLabel}</Label>
            <NativeSelect
              id={`khata-full-${slice}-person`}
              data-testid={`khata-full-${slice}-person`}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">{ui.everyone}</option>
              {(usersQ.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {historyQ.isPending ? (
            <LoadingState />
          ) : historyQ.error ? (
            <ErrorState error={historyQ.error} onRetry={() => void historyQ.refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState label={ui.historyEmptyFull} />
          ) : (
            <ShowMore
              items={filtered}
              initial={30}
              as="ul"
              className="divide-y"
              testIdPrefix={`khata-full-${slice}`}
              renderItem={(t) => <TransferRow key={t.id} t={t} userName={userName} />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// d — Who holds what (rollup), lazy-gated
// ---------------------------------------------------------------------------

function RollupSubPage({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  const m = useMessages();
  const { shown, show } = useLazySection();
  const rollupQ = useQuery({
    queryKey: ['ledger-rollup'],
    queryFn: () => api<LedgerRollupRow[]>('GET', '/ledger/rollup'),
    enabled: shown,
  });

  return (
    <div className="grid gap-4" data-testid="khata-rollup-section">
      <SubPageHeader title={title} onBack={onClose} />
      <Card>
        <CardHeader>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <LazyHistorySection
            title={m.LEDGER_UI.rollupTitle}
            shown={shown}
            onFirstShow={show}
            onRefresh={() => void rollupQ.refetch()}
            refreshing={rollupQ.isFetching}
            testId="khata-rollup-lazy"
          >
            {rollupQ.isPending ? (
              <LoadingState />
            ) : rollupQ.error ? (
              <ErrorState error={rollupQ.error} onRetry={() => void rollupQ.refetch()} />
            ) : !rollupQ.data || rollupQ.data.length === 0 ? (
              <EmptyState label={m.LEDGER_UI.rollupEmpty} />
            ) : (
              <ul className="divide-y">
                {rollupQ.data.map((row) => (
                  <li key={row.userId} className="grid gap-2 py-3 first:pt-0 last:pb-0" data-testid={`khata-rollup-row-${row.userId}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {row.name} <span className="text-xs font-normal text-muted-foreground">{m.ROLE_LABELS[row.role]}</span>
                      </p>
                      <p
                        className={cn('shrink-0 text-sm font-bold tabular-nums', row.balancePaise < 0 && 'text-destructive')}
                        data-testid={`khata-rollup-balance-${row.userId}`}
                      >
                        {formatSignedPaise(row.balancePaise)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.LEDGER_UI.rollupReceived} {formatPaise(row.receivedPaise)} · {m.LEDGER_UI.rollupGiven}{' '}
                      {formatPaise(row.givenPaise)} · {m.LEDGER_UI.rollupSpent} {formatPaise(row.spentPaise)}
                    </p>
                    <RollupCategoryChips byCategory={row.byCategory} />
                  </li>
                ))}
              </ul>
            )}
          </LazyHistorySection>
        </CardContent>
      </Card>
    </div>
  );
}

function RollupCategoryChips({ byCategory }: { byCategory: LedgerRollupRow['byCategory'] }) {
  const m = useMessages();
  // Frozen enum order keeps the chips stable regardless of server key order.
  const chips = EXPENSE_CATEGORIES.map((c) => ({ category: c, paise: byCategory[c] })).filter(
    (x): x is { category: (typeof EXPENSE_CATEGORIES)[number]; paise: number } => x.paise !== undefined && x.paise > 0,
  );
  if (chips.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-1">
      {chips.map(({ category, paise }) => (
        <span key={category} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" data-testid={`khata-rollup-cat-${category}`}>
          {m.EXPENSE_CATEGORY_LABELS[category]} {formatPaise(paise)}
        </span>
      ))}
    </p>
  );
}
