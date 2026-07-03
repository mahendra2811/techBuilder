'use client';

/**
 * Site drill-in (/owner/sites/[id]) — READ-ONLY records view for the Owner.
 *
 * Header (name/code) + 7/30-day window toggle + four tabs:
 *   Attendance (person, status, OT, marked-by) · Expenses (category, ₹,
 *   entered-by, VOID) · Progress (text) · Fuel (vehicle reg, litres, ₹).
 * Fuel rows carry vehicleId (not siteId), so the unfiltered fuel list is
 * filtered client-side to vehicles assigned to this site.
 *
 * Trust feature: any row with version > 1 shows the audit chip
 * ("corrected — <user> · <dd MMM, HH:mm>", Asia/Kolkata). No edit/void here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type {
  Attendance,
  Expense,
  FuelLog,
  Person,
  ProgressNote,
  Site,
  User,
  UUID,
  Vehicle,
} from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { ATTENDANCE_STATUS_LABELS, EXPENSE_CATEGORY_LABELS, OWNER_UI } from '@/lib/messages';
import { formatPaise } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AuditChip } from '@/components/owner/audit-chip';
import { WindowToggle } from '@/components/owner/window-toggle';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type DetailWindow = '7d' | '30d';
type Tab = 'attendance' | 'expenses' | 'progress' | 'fuel';

const WINDOW_OPTIONS = [
  { value: '7d', label: OWNER_UI.window7d },
  { value: '30d', label: OWNER_UI.window30d },
] as const;

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'attendance', label: OWNER_UI.tabAttendance },
  { value: 'expenses', label: OWNER_UI.tabExpenses },
  { value: 'progress', label: OWNER_UI.tabProgress },
  { value: 'fuel', label: OWNER_UI.tabFuel },
];

export function SiteDetailScreen({ siteId }: { siteId: UUID }) {
  const today = useMemo(() => todayKolkata(), []);
  const [win, setWin] = useState<DetailWindow>('7d');
  const [tab, setTab] = useState<Tab>('attendance');
  const from = addDays(today, win === '7d' ? -6 : -29);

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });

  const attendanceQ = useQuery({
    queryKey: ['attendance', siteId, from, today],
    queryFn: () => api<Attendance[]>('GET', `/attendance?siteId=${siteId}&from=${from}&to=${today}`),
  });
  const expensesQ = useQuery({
    queryKey: ['records', 'expense', siteId, from, today],
    queryFn: () => api<Expense[]>('GET', `/records/expense?siteId=${siteId}&from=${from}&to=${today}`),
  });
  const progressQ = useQuery({
    queryKey: ['records', 'progress', siteId, from, today],
    queryFn: () => api<ProgressNote[]>('GET', `/records/progress?siteId=${siteId}&from=${from}&to=${today}`),
  });
  // Fuel has NO siteId — fetch the window unfiltered, then keep vehicles assigned to this site.
  const fuelQ = useQuery({
    queryKey: ['records', 'fuel', from, today],
    queryFn: () => api<FuelLog[]>('GET', `/records/fuel?from=${from}&to=${today}`),
  });

  const site = sitesQ.data?.find((s) => s.id === siteId);
  const users = usersQ.data;
  const personName = (id: UUID) => peopleQ.data?.find((p) => p.id === id)?.name ?? id;
  const userName = (id: UUID) => users?.find((u) => u.id === id)?.name ?? OWNER_UI.auditUnknownUser;
  const siteVehicleIds = new Set((vehiclesQ.data ?? []).filter((v) => v.assignedSiteId === siteId).map((v) => v.id));
  const regNo = (id: UUID) => vehiclesQ.data?.find((v) => v.id === id)?.regNo ?? OWNER_UI.unknownVehicle;

  const byDateDesc = <T extends { businessDate: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => b.businessDate.localeCompare(a.businessDate));

  return (
    <div className="grid gap-4" data-testid="site-detail">
      <div className="flex items-center gap-3">
        <Link
          href="/owner/sites"
          data-testid="site-back"
          className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {OWNER_UI.siteBack}
        </Link>
      </div>

      <Card>
        <CardHeader>
          {sitesQ.isPending ? (
            <LoadingState />
          ) : sitesQ.error ? (
            <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
          ) : site ? (
            <CardTitle data-testid="site-detail-title">
              {site.name} <span className="font-normal text-muted-foreground">({site.code})</span>
            </CardTitle>
          ) : (
            <EmptyState label={OWNER_UI.siteNotFound} />
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <WindowToggle options={WINDOW_OPTIONS} value={win} onChange={setWin} testIdPrefix="detail-window" />

          <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                data-testid={`detail-tab-${t.value}`}
                className={cn(
                  'rounded-md px-1 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                  tab === t.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Separator />

          {tab === 'attendance' && (
            <RecordList
              query={attendanceQ}
              emptyLabel={OWNER_UI.attendanceEmpty}
              testId="detail-attendance"
              rows={(data) =>
                byDateDesc(data).map((a) => (
                  <RecordRow
                    key={a.id}
                    testId={`attendance-row-${a.id}`}
                    primary={personName(a.personId)}
                    secondary={
                      ATTENDANCE_STATUS_LABELS[a.status] + (a.otHours > 0 ? ` · ${OWNER_UI.otPrefix} ${a.otHours}h` : '')
                    }
                    tertiary={`${formatBusinessDateShort(a.businessDate)} · ${OWNER_UI.markedByPrefix} ${userName(a.markedBy)}`}
                    chip={<AuditChip row={a} users={users} />}
                  />
                ))
              }
            />
          )}

          {tab === 'expenses' && (
            <RecordList
              query={expensesQ}
              emptyLabel={OWNER_UI.expensesEmpty}
              testId="detail-expenses"
              rows={(data) =>
                byDateDesc(data).map((e) => (
                  <RecordRow
                    key={e.id}
                    testId={`expense-row-${e.id}`}
                    primary={EXPENSE_CATEGORY_LABELS[e.category] + (e.billNo ? ` · ${e.billNo}` : '')}
                    amount={formatPaise(e.amountPaise)}
                    tertiary={`${formatBusinessDateShort(e.businessDate)} · ${OWNER_UI.enteredByPrefix} ${userName(e.enteredBy)}`}
                    chip={
                      <>
                        {e.void && (
                          <span className="inline-block w-fit rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                            {OWNER_UI.voided}
                          </span>
                        )}
                        <AuditChip row={e} users={users} />
                      </>
                    }
                  />
                ))
              }
            />
          )}

          {tab === 'progress' && (
            <RecordList
              query={progressQ}
              emptyLabel={OWNER_UI.progressEmpty}
              testId="detail-progress"
              rows={(data) =>
                byDateDesc(data).map((n) => (
                  <RecordRow
                    key={n.id}
                    testId={`progress-row-${n.id}`}
                    primary={n.text}
                    tertiary={`${formatBusinessDateShort(n.businessDate)} · ${OWNER_UI.enteredByPrefix} ${userName(n.enteredBy)}`}
                    chip={<AuditChip row={n} users={users} />}
                    wrapPrimary
                  />
                ))
              }
            />
          )}

          {tab === 'fuel' && (
            <RecordList
              query={fuelQ}
              emptyLabel={OWNER_UI.fuelEmpty}
              testId="detail-fuel"
              filter={(rows) => rows.filter((f) => siteVehicleIds.has(f.vehicleId))}
              rows={(data) =>
                byDateDesc(data).map((f) => (
                  <RecordRow
                    key={f.id}
                    testId={`fuel-row-${f.id}`}
                    primary={regNo(f.vehicleId)}
                    secondary={`${f.litres} ${OWNER_UI.litresSuffix}`}
                    amount={formatPaise(f.amountPaise)}
                    tertiary={`${formatBusinessDateShort(f.businessDate)} · ${OWNER_UI.readingPrefix} ${f.reading}`}
                    chip={<AuditChip row={f} users={users} />}
                  />
                ))
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List shell + row (shared by the four tabs)
// ---------------------------------------------------------------------------

interface QueryLike<T> {
  isPending: boolean;
  error: unknown;
  data: T[] | undefined;
  refetch: () => unknown;
}

function RecordList<T>({
  query,
  emptyLabel,
  testId,
  rows,
  filter,
}: {
  query: QueryLike<T>;
  emptyLabel: string;
  testId: string;
  rows: (data: T[]) => React.ReactNode;
  filter?: (data: T[]) => T[];
}) {
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = filter ? filter(query.data ?? []) : (query.data ?? []);
  if (data.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <ul className="divide-y" data-testid={testId}>
      {rows(data)}
    </ul>
  );
}

function RecordRow({
  primary,
  secondary,
  amount,
  tertiary,
  chip,
  testId,
  wrapPrimary = false,
}: {
  primary: string;
  secondary?: string;
  amount?: string;
  tertiary: string;
  chip?: React.ReactNode;
  testId: string;
  wrapPrimary?: boolean;
}) {
  return (
    <li className="grid gap-1 py-2.5 first:pt-0 last:pb-0" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('min-w-0 text-sm font-medium', !wrapPrimary && 'truncate')}>
          {primary}
          {secondary && <span className="ml-1.5 font-normal text-muted-foreground">{secondary}</span>}
        </p>
        {amount && <span className="shrink-0 text-sm font-medium tabular-nums">{amount}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{tertiary}</p>
      {chip && <div className="flex flex-wrap gap-1">{chip}</div>}
    </li>
  );
}
