'use client';

/**
 * PHASE-PARKED: unrouted since 2026-07; attendance/wages are manual this phase.
 *
 * Attendance roster (Owner + SM + TH — one component, three thin route
 * wrappers). Role differences are entirely data-driven: GET /sites (Owner all,
 * SM own, TH one) feeds the picker, GET /people pre-scopes the roster, and
 * minEntryDate applies the role's backdating window (Owner unlimited).
 *
 * ≤30-second flow: date defaults to today → "All present" → adjust exceptions →
 * single submit. Existing attendance for the chosen date+site pre-fills the
 * roster, so re-opening shows saved state and edits become server-side upsert
 * corrections (version bumps).
 *
 * Only CHANGED rows are submitted — re-sending an identical row would bump its
 * version and falsely flag it as "corrected" in exports.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { ATTENDANCE_STATUSES } from '@techbuilder/contracts';
import type {
  Attendance,
  AttendanceStatus,
  BusinessDate,
  MarkAttendanceInput,
  Person,
  Site,
  UUID,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { minEntryDate, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DateField } from '@/components/entry/date-field';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type EntryRole = 'OWNER' | 'SITE_MANAGER' | 'TEAM_HEAD';

interface RowEdit {
  status?: AttendanceStatus;
  /** Kept as string while typing; parsed on submit. */
  otHours?: string;
}

const STATUS_SELECTED_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent',
  ABSENT: 'bg-destructive text-white hover:bg-destructive/90 border-transparent',
  HALF_DAY: 'bg-amber-500 text-white hover:bg-amber-500/90 border-transparent',
};

/** Pending local edits are tagged with their site|date context — switching
 * context implicitly discards them (derived reset, no effects needed). */
interface PendingState {
  context: string;
  edits: Record<UUID, RowEdit>;
  savedCount: number | null;
}

export function AttendanceScreen({ role }: { role: EntryRole }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const [date, setDate] = useState<BusinessDate>(today);
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');

  const meQ = useQuery({ queryKey: ['me'], queryFn: me, enabled: role === 'TEAM_HEAD' });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });

  // Default to the first scoped site (TH has exactly one) — derived, no effect.
  const sites = sitesQ.data;
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');

  const attendanceQ = useQuery({
    queryKey: ['attendance', siteId, date],
    queryFn: () => {
      const qs = new URLSearchParams({ siteId, from: date, to: date });
      return api<Attendance[]>('GET', `/attendance?${qs}`);
    },
    enabled: siteId !== '',
  });

  const context = `${siteId}|${date}`;
  const [pending, setPending] = useState<PendingState>({ context, edits: {}, savedCount: null });
  const edits = pending.context === context ? pending.edits : {};
  const savedCount = pending.context === context ? pending.savedCount : null;

  /** Server baseline for the chosen date+site, keyed by personId. */
  const baseline = useMemo(() => {
    const map = new Map<UUID, Attendance>();
    for (const a of attendanceQ.data ?? []) map.set(a.personId, a);
    return map;
  }, [attendanceQ.data]);

  const people = peopleQ.data ?? [];

  const effectiveStatus = (personId: UUID): AttendanceStatus | undefined =>
    edits[personId]?.status ?? baseline.get(personId)?.status;
  const effectiveOt = (personId: UUID): string => {
    const edit = edits[personId];
    if (edit?.otHours !== undefined) return edit.otHours;
    const base = baseline.get(personId)?.otHours;
    return base ? String(base) : '';
  };

  /** Rows whose effective state differs from the server baseline (plain render
   * computation — rosters are small; re-sending unchanged rows would falsely
   * bump versions). */
  const changedRows = people.filter((p) => {
    const status = effectiveStatus(p.id);
    if (!status) return false;
    const base = baseline.get(p.id);
    const ot = parseOt(effectiveOt(p.id));
    if (!base) return true;
    return base.status !== status || (base.otHours || 0) !== (ot ?? 0);
  });

  const mark = useMutation({
    mutationFn: (input: MarkAttendanceInput) => api<Attendance[]>('POST', '/attendance', input),
    onSuccess: (saved) => {
      setPending({ context, edits: {}, savedCount: saved.length });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const patchRow = (personId: UUID, patch: RowEdit) => {
    mark.reset();
    setPending({ context, edits: { ...edits, [personId]: { ...edits[personId], ...patch } }, savedCount: null });
  };
  const setStatus = (personId: UUID, status: AttendanceStatus) => patchRow(personId, { status });
  const setOt = (personId: UUID, otHours: string) => patchRow(personId, { otHours });
  const allPresent = () => {
    mark.reset();
    const next = { ...edits };
    for (const p of people) next[p.id] = { ...next[p.id], status: 'PRESENT' };
    setPending({ context, edits: next, savedCount: null });
  };

  const submit = () => {
    if (!siteId || changedRows.length === 0) return;
    const input: MarkAttendanceInput = {
      siteId,
      crewId: role === 'TEAM_HEAD' ? (meQ.data?.user.crewId ?? undefined) : undefined,
      businessDate: date,
      rows: changedRows.map((p) => {
        const ot = parseOt(effectiveOt(p.id));
        return {
          id: uuidv7(),
          personId: p.id,
          status: effectiveStatus(p.id)!,
          ...(ot !== undefined ? { otHours: ot } : {}),
        };
      }),
    };
    mark.mutate(input);
  };

  const serverError =
    mark.error instanceof ApiClientError ? apiErrorMessage(m, mark.error.code) : mark.error ? apiErrorMessage(m) : null;

  return (
    <div className="grid gap-4" data-testid="attendance-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.ENTRY_UI.attendanceTitle}</CardTitle>
          <CardDescription>{m.ENTRY_UI.attendanceSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 items-end gap-3">
            <DateField
              id="attendance-date"
              testId="attendance-date"
              value={date}
              onChange={(d) => {
                mark.reset();
                setDate(d);
              }}
              min={minEntryDate(role, today)}
              max={today}
            />
            <Button
              type="button"
              variant="secondary"
              data-testid="attendance-all-present"
              onClick={allPresent}
              disabled={people.length === 0}
            >
              {m.ENTRY_UI.allPresent}
            </Button>
          </div>
          <SitePicker
            sites={sites}
            isLoading={sitesQ.isPending}
            value={siteId}
            onChange={(id) => {
              mark.reset();
              setPickedSiteId(id);
            }}
            error={sitesQ.error}
            onRetry={() => void sitesQ.refetch()}
          />

          <Separator />

          {peopleQ.isPending || (siteId !== '' && attendanceQ.isPending) ? (
            <LoadingState />
          ) : peopleQ.error ? (
            <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
          ) : attendanceQ.error ? (
            <ErrorState error={attendanceQ.error} onRetry={() => void attendanceQ.refetch()} />
          ) : people.length === 0 ? (
            <EmptyState label={m.ENTRY_UI.rosterEmpty} />
          ) : (
            <ul className="divide-y">
              {people.map((person) => {
                const status = effectiveStatus(person.id);
                const base = baseline.get(person.id);
                const pending = edits[person.id]?.status !== undefined || edits[person.id]?.otHours !== undefined;
                return (
                  <li key={person.id} className="grid gap-2 py-3" data-testid={`attendance-row-${person.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{person.name}</p>
                      {base && !pending && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3.5" aria-hidden="true" />
                          {m.ENTRY_UI.markedTick}
                          {base.version > 1 && (
                            <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-800 dark:text-amber-400">
                              {m.ENTRY_UI.corrected}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ATTENDANCE_STATUSES.map((s) => (
                        <Button
                          key={s}
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-pressed={status === s}
                          data-testid={`attendance-status-${s}-${person.id}`}
                          className={cn('flex-1', status === s && STATUS_SELECTED_CLASS[s])}
                          onClick={() => setStatus(person.id, s)}
                        >
                          {m.ATTENDANCE_STATUS_LABELS[s]}
                        </Button>
                      ))}
                      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        {m.ENTRY_UI.otHours}
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={24}
                          step={0.5}
                          aria-label={m.ENTRY_UI.otHoursAria}
                          data-testid={`attendance-ot-${person.id}`}
                          className="w-14 px-1.5 text-center"
                          value={effectiveOt(person.id)}
                          onChange={(e) => setOt(person.id, e.target.value)}
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {serverError && (
            <Notice tone="error" testId="attendance-error">
              {serverError}
            </Notice>
          )}
          {savedCount !== null && (
            <Notice tone="success" testId="attendance-saved">
              {m.ENTRY_UI.attendanceSavedPrefix} {savedCount} {m.ENTRY_UI.attendanceSavedSuffix}
            </Notice>
          )}
          {savedCount === null && !mark.isPending && people.length > 0 && changedRows.length === 0 && (
            <p className="text-xs text-muted-foreground">{m.ENTRY_UI.attendanceNoChanges}</p>
          )}

          <Button
            type="button"
            data-testid="attendance-submit"
            disabled={mark.isPending || changedRows.length === 0}
            onClick={submit}
          >
            {mark.isPending ? m.ENTRY_UI.saving : `${m.ENTRY_UI.attendanceSubmit} (${changedRows.length})`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** "" → undefined; clamps junk to a non-negative number. */
function parseOt(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
