'use client';

/**
 * PHASE-PARKED: unrouted since 2026-07; attendance/wages are manual this phase.
 *
 * Wage / cost summary (Owner + SM — one component, two thin wrappers).
 * READ-ONLY payroll-style view (NOT a payment rail):
 *   - window toggle (7 / 30 days) → GET /reports/wage-summary (auto-scoped:
 *     Owner sees the org, SM sees their site(s) — same pattern as the owner
 *     dashboard / reports screens),
 *   - totals strip (gross / advances / net, net-due phrased correctly when
 *     advances exceed what's earned),
 *   - per-worker rows,
 *   - "record an advance" (peshgi) — person-only (there is no crews endpoint
 *     to list/label a crew, same constraint noted in people-screen.tsx, so the
 *     crew half of CreateAdvanceInput is not exposed here),
 *   - "set a wage rate" — OWNER only (`config.manage`; SM has `wage.view` but
 *     not `config.manage`, mirrored client-side by the `role` prop passed from
 *     the server-pinned route).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type { CreateAdvanceInput, Person, SetWageRateInput, UUID, WageSummary } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, minEntryDate, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { WindowToggle } from '@/components/owner/window-toggle';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

type WagesRole = 'OWNER' | 'SITE_MANAGER';
type WagesWindow = '7d' | '30d';

const windowOptions = (o: Messages['OWNER_UI']) =>
  [
    { value: '7d', label: o.window7d },
    { value: '30d', label: o.window30d },
  ] as const;

export function WagesScreen({ role }: { role: WagesRole }) {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);
  const [win, setWin] = useState<WagesWindow>('30d');
  const from = addDays(today, win === '7d' ? -6 : -29);

  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const summaryQ = useQuery({
    queryKey: ['wage-summary', from, today],
    queryFn: () => api<WageSummary>('GET', `/reports/wage-summary?from=${from}&to=${today}`),
  });

  return (
    <div className="grid gap-4" data-testid="wages-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.WAGES_UI.title}</CardTitle>
          <CardDescription>{m.WAGES_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <WindowToggle options={windowOptions(m.OWNER_UI)} value={win} onChange={setWin} testIdPrefix="wages-window" />
        </CardContent>
      </Card>

      <SummaryCard summaryQ={summaryQ} />

      <AdvanceForm role={role} people={peopleQ.data ?? []} peopleLoading={peopleQ.isPending} today={today} />

      {role === 'OWNER' ? (
        <RateForm people={peopleQ.data ?? []} peopleLoading={peopleQ.isPending} today={today} />
      ) : (
        <Card size="sm" data-testid="wage-rate-readonly">
          <CardHeader>
            <CardTitle>{m.WAGES_UI.rateFormTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Notice tone="warning" testId="wage-rate-readonly-note">
              {m.WAGES_UI.rateReadOnlyNote}
            </Notice>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Totals + per-worker rows
// ---------------------------------------------------------------------------

function SummaryCard({ summaryQ }: { summaryQ: ReturnType<typeof useQuery<WageSummary>> }) {
  const m = useMessages();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{m.WAGES_UI.totalsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-20">
          {summaryQ.isPending ? (
            <LoadingState />
          ) : summaryQ.error ? (
            <ErrorState error={summaryQ.error} onRetry={() => void summaryQ.refetch()} />
          ) : summaryQ.data ? (
            <div className="grid grid-cols-3 gap-3" data-testid="wage-totals">
              <Stat testId="wage-total-gross" value={formatPaise(summaryQ.data.totals.grossPaise)} label={m.WAGES_UI.totalGross} />
              <Stat testId="wage-total-advance" value={formatPaise(summaryQ.data.totals.advancePaise)} label={m.WAGES_UI.totalAdvance} />
              <Stat
                testId="wage-total-net"
                value={formatPaise(Math.abs(summaryQ.data.totals.netPaise))}
                label={summaryQ.data.totals.netPaise < 0 ? m.WAGES_UI.totalNetDue : m.WAGES_UI.totalNet}
                negative={summaryQ.data.totals.netPaise < 0}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.WAGES_UI.rowsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-24">
          {summaryQ.isPending ? (
            <LoadingState />
          ) : summaryQ.error ? (
            <ErrorState error={summaryQ.error} onRetry={() => void summaryQ.refetch()} />
          ) : !summaryQ.data || summaryQ.data.rows.length === 0 ? (
            <EmptyState label={m.WAGES_UI.rowsEmpty} />
          ) : (
            <ul className="divide-y" data-testid="wage-rows">
              {summaryQ.data.rows.map((r) => {
                const netDue = r.netPayablePaise < 0;
                return (
                  <li key={r.personId} className="grid gap-1 py-3 first:pt-0 last:pb-0" data-testid={`wage-row-${r.personId}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{r.personName}</p>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${netDue ? 'text-destructive' : ''}`}>
                        {formatPaise(Math.abs(r.netPayablePaise))}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {netDue ? m.WAGES_UI.netDue : m.WAGES_UI.net}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.presentDays} {m.WAGES_UI.presentDaysShort} · {r.halfDays} {m.WAGES_UI.halfDaysShort} ·{' '}
                      {r.otHours} {m.WAGES_UI.otHoursShort} ·{' '}
                      {r.ratePaise > 0 ? `${formatPaise(r.ratePaise)} ${m.WAGES_UI.dailyRate}` : m.WAGES_UI.noRate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.WAGES_UI.gross}: {formatPaise(r.grossPayablePaise)} · {m.WAGES_UI.advance}: {formatPaise(r.advancePaise)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ value, label, testId, negative }: { value: string; label: string; testId: string; negative?: boolean }) {
  return (
    <div data-testid={testId} className="grid gap-0.5">
      <p className={`text-lg font-semibold tabular-nums ${negative ? 'text-destructive' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Record an advance (peshgi)
// ---------------------------------------------------------------------------

function AdvanceForm({
  role,
  people,
  peopleLoading,
  today,
}: {
  role: WagesRole;
  people: Person[];
  peopleLoading: boolean;
  today: string;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState<UUID | ''>('');
  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateAdvanceInput) => api('POST', '/advances', input),
    onSuccess: () => {
      setSaved(true);
      setPersonId('');
      setAmountRupees('');
      setDate(today);
      setNote('');
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['wage-summary'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const errs: Record<string, string> = {};
    if (!personId) errs.person = m.WAGES_UI.personRequired;
    const amount = Number(amountRupees);
    if (!amountRupees.trim() || !Number.isFinite(amount) || amount <= 0) errs.amount = m.WAGES_UI.amountInvalid;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    create.mutate({
      id: uuidv7(),
      personId: personId as UUID,
      amountPaise: rupeesToPaise(amount),
      businessDate: date,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="create-advance">
      <CardHeader>
        <CardTitle>{m.WAGES_UI.advanceFormTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="advance-person">{m.WAGES_UI.person}</Label>
            {peopleLoading ? (
              <LoadingState />
            ) : (
              <NativeSelect
                id="advance-person"
                data-testid="advance-person"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">{m.WAGES_UI.selectPerson}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            {errors.person && (
              <p className="text-sm text-destructive" role="alert">
                {errors.person}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="advance-amount">{m.WAGES_UI.amountRupees}</Label>
              <Input
                id="advance-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="advance-amount"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
              {errors.amount && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.amount}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="advance-date">{m.WAGES_UI.date}</Label>
              <Input
                id="advance-date"
                type="date"
                data-testid="advance-date"
                value={date}
                min={minEntryDate(role, today)}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="advance-note">{m.WAGES_UI.note}</Label>
            <Textarea id="advance-note" data-testid="advance-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="create-advance-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-advance-success">
              {m.WAGES_UI.advanceSaved}
            </Notice>
          )}

          <Button type="submit" data-testid="create-advance-submit" disabled={create.isPending}>
            {create.isPending ? m.WAGES_UI.savingAdvance : m.WAGES_UI.advanceSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Set a wage rate (OWNER only — config.manage)
// ---------------------------------------------------------------------------

function RateForm({ people, peopleLoading, today }: { people: Person[]; peopleLoading: boolean; today: string }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState<UUID | ''>('');
  const [dailyRupees, setDailyRupees] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: SetWageRateInput) => api('POST', '/wage-rates', input),
    onSuccess: () => {
      setSaved(true);
      setPersonId('');
      setDailyRupees('');
      setEffectiveFrom(today);
      setErrors({});
      void queryClient.invalidateQueries({ queryKey: ['wage-summary'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const errs: Record<string, string> = {};
    if (!personId) errs.person = m.WAGES_UI.personRequired;
    const daily = Number(dailyRupees);
    if (!dailyRupees.trim() || !Number.isFinite(daily) || daily <= 0) errs.amount = m.WAGES_UI.amountInvalid;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    create.mutate({
      id: uuidv7(),
      personId: personId as UUID,
      dailyPaise: rupeesToPaise(daily),
      effectiveFrom,
    });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="set-wage-rate">
      <CardHeader>
        <CardTitle>{m.WAGES_UI.rateFormTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="rate-person">{m.WAGES_UI.person}</Label>
            {peopleLoading ? (
              <LoadingState />
            ) : (
              <NativeSelect id="rate-person" data-testid="rate-person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">{m.WAGES_UI.selectPerson}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            {errors.person && (
              <p className="text-sm text-destructive" role="alert">
                {errors.person}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="rate-amount">{m.WAGES_UI.dailyRate}</Label>
              <Input
                id="rate-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="rate-amount"
                value={dailyRupees}
                onChange={(e) => setDailyRupees(e.target.value)}
              />
              {errors.amount && (
                <p className="text-sm text-destructive" role="alert">
                  {errors.amount}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate-effective">{m.WAGES_UI.effectiveFrom}</Label>
              <Input
                id="rate-effective"
                type="date"
                data-testid="rate-effective"
                value={effectiveFrom}
                onChange={(e) => e.target.value && setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>

          {serverError && (
            <Notice tone="error" testId="set-wage-rate-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="set-wage-rate-success">
              {m.WAGES_UI.rateSaved}
            </Notice>
          )}

          <Button type="submit" data-testid="set-wage-rate-submit" disabled={create.isPending}>
            {create.isPending ? m.WAGES_UI.savingRate : m.WAGES_UI.rateSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
