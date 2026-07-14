'use client';

/**
 * WO-13 per-person drill-down (Owner + SM + TH — one component, three thin route
 * wrappers under {role}/people/[id]). Reached from a people-screen row. GET
 * /insights/person/:id is scope-enforced server-side (SM: person must be a user
 * of his site; TH: person must be in his own crew; Owner: any).
 *
 * WO-10 (wave 2): each day collapses to a header row (date + counts + "no
 * progress" flag) and expands on tap — the full progress/expense/request lists
 * render only for the expanded day(s), and only the first DAY_PAGE_SIZE days
 * render at all until "show more days" is tapped. Also mounts the WO-9
 * reset-password action for Owner/SM (never Supervisor, never yourself).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Pencil } from 'lucide-react';
import type { Person, PersonInsights, UpdatePersonInput, User, UUID } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { CREATABLE_ROLES } from '@/lib/cascade';
import { formatBusinessDate, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ShowMore } from '@/components/ui/show-more';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DatePresets, type DateRange } from '@/components/insights/date-presets';
import { ProgressList, ExpenseList, RequestList } from '@/components/insights/record-lists';
import { PeriodSummary } from '@/components/insights/period-summary';
import { ResetPasswordAction } from '@/components/people/reset-password-action';
import { cn } from '@/lib/utils';

type PeopleRole = 'OWNER' | 'SITE_MANAGER' | 'SUPERVISOR';
const DAY_PAGE_SIZE = 7;

// Round 2 (CW-4): ID-card details on the person profile — OWNER/SITE_MANAGER may edit;
// the server enforces the same narrow rule (see backend/src/people/people.service.ts).
const ID_CARD_UI = {
  en: {
    title: 'ID card',
    mobile: 'Mobile',
    guardianName: 'Guardian name',
    guardianPhone: 'Guardian mobile',
    edit: 'Edit ID card',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    saved: 'ID card updated',
    none: 'Not set',
  },
  hi: {
    title: 'ID कार्ड',
    mobile: 'मोबाइल',
    guardianName: 'अभिभावक का नाम',
    guardianPhone: 'अभिभावक का मोबाइल',
    edit: 'ID कार्ड संपादित करें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'ID कार्ड अपडेट हो गया',
    none: 'सेट नहीं है',
  },
} as const;
// Widened (plain `string` fields): `ID_CARD_UI[locale]` (locale: 'en' | 'hi') resolves to
// the UNION of both branches' literal-object types, which isn't assignable to either
// branch alone — components receiving it as a prop need this wider, non-literal shape.
type IdCardUi = { [K in keyof (typeof ID_CARD_UI)['en']]: string };

export function PersonInsightsScreen({ userId, backHref, role }: { userId: UUID; backHref: string; role: PeopleRole }) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;
  const today = useMemo(() => todayKolkata(), []);
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const insightsQ = useQuery({
    queryKey: ['insights', 'person', userId, range.from, range.to],
    queryFn: () => api<PersonInsights>('GET', `/insights/person/${userId}?from=${range.from}&to=${range.to}`),
  });
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  // The target's own name resolves everything they entered/requested; other actors
  // (e.g. who decided a request) fall back to a generic label — insights/person has
  // no scoped user directory of its own the way the site-wide screen does.
  const userName = (id: UUID) => (id === userId ? (insightsQ.data?.name ?? i.unknownUser) : i.unknownUser);

  const targetUser = usersQ.data?.find((u) => u.id === userId);
  // Round 2 (CW-4): the ID-card fields live on the labour-master Person row, linked via
  // the target user's personId (users without a linked person — e.g. Owner/SM logins —
  // simply have no ID card to show).
  const targetPerson = peopleQ.data?.find((p) => p.id === targetUser?.personId);
  // Mirrors people-screen's canResetPassword: Owner any, SM only roles they may
  // create, never Supervisor, never yourself.
  const canResetPassword =
    role !== 'SUPERVISOR' && userId !== meQ.data?.user.id && !!targetUser && (role === 'OWNER' || CREATABLE_ROLES[role].includes(targetUser.role));
  // Round 2 (CW-4): ID-card edit gated to OWNER/SITE_MANAGER only (server enforces the
  // narrower SM-in-reach rule).
  const canEditIdCard = (role === 'OWNER' || role === 'SITE_MANAGER') && !!targetPerson;

  const toggleDay = (date: string) =>
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const daySummary = (d: PersonInsights['days'][number]): string => {
    const parts: string[] = [];
    if (d.progress.length > 0) parts.push(`${d.progress.length} ${i.daySummaryProgress}`);
    if (d.expenses.length > 0) parts.push(`${d.expenses.length} ${i.daySummaryExpense}`);
    if (d.requests.length > 0) parts.push(`${d.requests.length} ${i.daySummaryRequest}`);
    return parts.length > 0 ? parts.join(' · ') : i.daySummaryNone;
  };

  return (
    <div className="grid gap-4" data-testid="person-insights">
      <Link
        href={backHref}
        data-testid="person-insights-back"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {i.personBack}
      </Link>

      <Card>
        <CardHeader>
          {insightsQ.isPending ? (
            <LoadingState />
          ) : insightsQ.error ? (
            <ErrorState error={insightsQ.error} onRetry={() => void insightsQ.refetch()} />
          ) : (
            <CardTitle data-testid="person-insights-name">{insightsQ.data?.name ?? i.personTitle}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <DatePresets today={today} value={range} onChange={setRange} testIdPrefix="person-insights-date" />
          {canResetPassword && <ResetPasswordAction userId={userId} testIdPrefix="person-insights-reset-password" />}
        </CardContent>
      </Card>

      {targetPerson && <PersonIdCardSection person={targetPerson} canEdit={canEditIdCard} />}

      {insightsQ.data && (
        <>
          <Card data-testid="person-insights-totals-card">
            <CardHeader>
              <CardTitle>{i.personTotalsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <PeriodSummary totals={insightsQ.data.totals} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{i.personDaysTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {insightsQ.data.days.every((d) => d.progress.length === 0 && d.expenses.length === 0 && d.requests.length === 0) ? (
                <EmptyState label={i.periodEmpty} />
              ) : (
                <ShowMore
                  items={insightsQ.data.days}
                  initial={DAY_PAGE_SIZE}
                  className="grid gap-3"
                  testIdPrefix="person-insights-days"
                  renderItem={(d) => {
                    const isExpanded = expandedDates.has(d.businessDate);
                    return (
                      <div key={d.businessDate} className="rounded-lg border border-input" data-testid={`person-insights-day-${d.businessDate}`}>
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 p-3 text-left"
                          data-testid={`person-insights-day-toggle-${d.businessDate}`}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? i.dayCollapseAria : i.dayExpandAria}
                          onClick={() => toggleDay(d.businessDate)}
                        >
                          <div className="min-w-0 flex-1 grid gap-0.5">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{formatBusinessDate(d.businessDate)}</p>
                              {d.noProgress && (
                                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                                  {i.noProgressBanner}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{daySummary(d)}</p>
                          </div>
                          <ChevronDown
                            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>
                        {isExpanded && (
                          <div className="grid gap-2 border-t border-input p-3">
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.progressTitle}</p>
                              <ProgressList notes={d.progress} userName={userName} />
                            </div>
                            <Separator />
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.expensesTitle}</p>
                              <ExpenseList expenses={d.expenses} userName={userName} />
                            </div>
                            <Separator />
                            <div className="grid gap-2">
                              <p className="text-xs font-medium text-muted-foreground">{i.requestsTitle}</p>
                              <RequestList requests={d.requests} userName={userName} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ID card section (Round 2 / CW-4) — read for everyone allowed on this profile,
// edit form for OWNER/SITE_MANAGER only (server re-checks scope on save).
// ---------------------------------------------------------------------------

function PersonIdCardSection({ person, canEdit }: { person: Person; canEdit: boolean }) {
  const locale = useLocale();
  const ui = ID_CARD_UI[locale];
  const [editing, setEditing] = useState(false);

  return (
    <Card data-testid="person-insights-id-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{ui.title}</CardTitle>
        {canEdit && !editing && (
          <Button type="button" size="sm" variant="outline" data-testid="person-insights-id-card-edit-toggle" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 size-3.5" aria-hidden="true" />
            {ui.edit}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {!editing ? (
          <>
            <p className="text-sm" data-testid="person-insights-id-card-mobile">
              {ui.mobile}: {person.phone ?? ui.none}
            </p>
            <p className="text-sm" data-testid="person-insights-id-card-guardian-name">
              {ui.guardianName}: {person.guardianName ?? ui.none}
            </p>
            <p className="text-sm" data-testid="person-insights-id-card-guardian-phone">
              {ui.guardianPhone}: {person.guardianPhone ?? ui.none}
            </p>
          </>
        ) : (
          <PersonIdCardEditForm person={person} ui={ui} onDone={() => setEditing(false)} />
        )}
      </CardContent>
    </Card>
  );
}

function PersonIdCardEditForm({
  person,
  ui,
  onDone,
}: {
  person: Person;
  ui: IdCardUi;
  onDone: () => void;
}) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(person.phone ?? '');
  const [guardianName, setGuardianName] = useState(person.guardianName ?? '');
  const [guardianPhone, setGuardianPhone] = useState(person.guardianPhone ?? '');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (input: UpdatePersonInput) => api<Person>('PATCH', `/people/${person.id}`, input),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  const serverError =
    save.error instanceof ApiClientError ? apiErrorMessage(m, save.error.code) : save.error ? apiErrorMessage(m) : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    save.mutate({
      phone: phone.trim(),
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim(),
    });
  };

  return (
    <form className="grid gap-3" noValidate onSubmit={onSubmit} data-testid="person-insights-id-card-form">
      <div className="grid gap-2">
        <Label htmlFor="person-insights-id-card-phone">{ui.mobile}</Label>
        <Input
          id="person-insights-id-card-phone"
          type="tel"
          inputMode="tel"
          data-testid="person-insights-id-card-phone-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="person-insights-id-card-guardian-name">{ui.guardianName}</Label>
        <Input
          id="person-insights-id-card-guardian-name"
          data-testid="person-insights-id-card-guardian-name-input"
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="person-insights-id-card-guardian-phone">{ui.guardianPhone}</Label>
        <Input
          id="person-insights-id-card-guardian-phone"
          type="tel"
          inputMode="tel"
          data-testid="person-insights-id-card-guardian-phone-input"
          value={guardianPhone}
          onChange={(e) => setGuardianPhone(e.target.value)}
        />
      </div>
      {serverError && (
        <Notice tone="error" testId="person-insights-id-card-error">
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId="person-insights-id-card-success">
          {ui.saved}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" data-testid="person-insights-id-card-save" disabled={save.isPending}>
          {save.isPending ? ui.saving : ui.save}
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid="person-insights-id-card-cancel" onClick={onDone}>
          {ui.cancel}
        </Button>
      </div>
    </form>
  );
}
