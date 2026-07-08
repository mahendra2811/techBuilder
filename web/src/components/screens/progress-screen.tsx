'use client';

/**
 * Progress-report screen (SM + TH — the "Progress" half of the old combined
 * Records screen, WO-14, split out to mirror expense-screen.tsx). Morning +
 * evening usage: 2–3 reports/day are normal, and multiple notes per site/day
 * are allowed — filing one never blocks another, whether it's the same
 * person again or a different role (if the Team Head already filed today,
 * the Site Manager doesn't need to, and vice versa, but nothing stops either
 * of them from filing anyway). Text is free-form ("what was done today");
 * up to 20 site photos, up to 4 bill photos, and an optional voice note (org
 * features.voiceNotes gate) can be attached. Photos/voice are best-effort: a
 * failed upload never blocks the report (non-blocking notice).
 *
 * ASSUMPTION (backend text requirement): CreateProgressNoteInput.text is
 * validated server-side with z.string().min(1) — it is never actually
 * optional, even though the product rule is "required unless photos
 * attached". When the user attaches a photo/voice note and leaves the text
 * blank, we submit the canonical PHOTO_ONLY_NOTE_TEXT marker (see
 * lib/i18n/messages.ts) instead of an empty string — the same technique the
 * old combined screen uses for its "Nothing to report" quick action
 * (NOTHING_TO_REPORT_TEXT).
 *
 * ASSUMPTION (media-kind display): GET /records/progress returns only raw
 * `mediaIds` (UUIDs) — there is no media-list/metadata endpoint yet (R2
 * upload/download is pending), so a note filed by someone else can't be
 * broken down into "N photos + voice" after the fact, only a total
 * attachment count. The history below shows one generic attachment chip per
 * note instead of a true photo-vs-voice split; actual image/audio rendering
 * is not attempted for the same reason.
 *
 * ASSUMPTION (no edit flow): unlike a single-editable record, this screen is
 * create-only — the product rule is "file another report", not "edit the
 * one you filed". There is no version/edit-conflict re-read+retry here for
 * the same reason expense-screen.tsx has none: creates are idempotent by
 * client-generated id (the backend-modules.md pattern), not
 * optimistic-concurrency updates.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { Paperclip } from 'lucide-react';
import type { BusinessDate, CreateProgressNoteInput, ProgressNote, Site, User, UUID } from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, formatBusinessDate, formatKolkataDateTime, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { PHOTO_ONLY_NOTE_TEXT, apiErrorMessage, type Messages } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/entry/date-field';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

type EntryRole = 'SITE_MANAGER' | 'TEAM_HEAD';
const MAX_SITE_PHOTOS = 20;
const MAX_BILL_PHOTOS = 4;

export function ProgressScreen({ role }: { role: EntryRole }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');
  const [date, setDate] = useState<BusinessDate>(today);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  // Scoped to the caller's site/crew (view.all) — resolves "who filed" in the history lists.
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const userName = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? m.PROGRESS_UI.unknownUser;

  const sites = sitesQ.data;
  // Default to the first scoped site (TH has exactly one) — derived, no effect.
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');
  const voiceEnabled = meQ.data?.org.config.features.voiceNotes ?? false;

  // Dedicated "today only" fetch — powers both the covered-banner and the
  // "today's reports" list below (kept separate from the 7-day history query
  // so the banner doesn't have to wait on/derive from a bigger payload).
  const todayQs = siteId ? new URLSearchParams({ siteId, from: today, to: today }).toString() : '';
  const todayQ = useQuery({
    queryKey: ['records', 'progress', siteId, today, today],
    queryFn: () => api<ProgressNote[]>('GET', `/records/progress?${todayQs}`),
    enabled: siteId !== '',
  });
  // Backend orders by createdAt DESC, so the first row is the latest filing.
  const todaysNotes = todayQ.data ?? [];
  const latestToday = todaysNotes[0];

  const historyFrom = addDays(today, -7);
  const historyQs = siteId ? new URLSearchParams({ siteId, from: historyFrom, to: today }).toString() : '';
  const historyQ = useQuery({
    queryKey: ['records', 'progress', siteId, historyFrom, today],
    queryFn: () => api<ProgressNote[]>('GET', `/records/progress?${historyQs}`),
    enabled: siteId !== '',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['records', 'progress'] });
  };

  return (
    <div className="grid gap-4" data-testid="progress-screen" data-role={role}>
      <Card>
        <CardHeader>
          <CardTitle>{m.PROGRESS_UI.title}</CardTitle>
          <CardDescription>{m.PROGRESS_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SitePicker sites={sites} isLoading={sitesQ.isPending} value={siteId} onChange={setPickedSiteId} />
          <DateField id="progress-date" testId="progress-date" value={date} onChange={setDate} max={today} />

          {/* Filing another report is NEVER blocked by this — informational only. */}
          {latestToday && (
            <Notice tone="success" testId="progress-covered-banner">
              {m.PROGRESS_UI.coveredBannerPrefix} {userName(latestToday.enteredBy)} ·{' '}
              {formatKolkataDateTime(latestToday.createdAt)}
            </Notice>
          )}

          <Separator />

          <ProgressForm siteId={siteId} date={date} voiceEnabled={voiceEnabled} onSaved={invalidate} />
        </CardContent>
      </Card>

      <TodaysReports
        notes={todaysNotes}
        isLoading={siteId !== '' && todayQ.isPending}
        error={todayQ.error}
        onRetry={() => void todayQ.refetch()}
        userName={userName}
      />

      <ProgressHistory
        notes={historyQ.data}
        isLoading={siteId !== '' && historyQ.isPending}
        error={historyQ.error}
        onRetry={() => void historyQ.refetch()}
        userName={userName}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry form
// ---------------------------------------------------------------------------

function ProgressForm({
  siteId,
  date,
  voiceEnabled,
  onSaved,
}: {
  siteId: UUID | '';
  date: BusinessDate;
  voiceEnabled: boolean;
  onSaved: () => void;
}) {
  const m = useMessages();

  const [text, setText] = useState('');
  const [sitePhotos, setSitePhotos] = useState<File[]>([]);
  const [billPhotos, setBillPhotos] = useState<File[]>([]);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);

  const [textError, setTextError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [photoWarning, setPhotoWarning] = useState(false);

  const resetFields = () => {
    setText('');
    setSitePhotos([]);
    setBillPhotos([]);
    setVoiceBlob(null);
  };

  const clearNotices = () => {
    setSaved(false);
    setPhotoWarning(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      const siteIds = sitePhotos.length
        ? await uploadPhotos(sitePhotos, { kind: 'PHOTO', parentType: 'progress_note', parentId: id })
        : [];
      const billIds = billPhotos.length
        ? await uploadPhotos(billPhotos, { kind: 'RECEIPT', parentType: 'progress_note', parentId: id })
        : [];
      let voiceId: UUID | null = null;
      let voiceFailed = false;
      if (voiceBlob) {
        voiceId = await uploadVoice(voiceBlob, { parentType: 'progress_note', parentId: id });
        voiceFailed = voiceId === null;
      }
      const attempted = sitePhotos.length + billPhotos.length + (voiceBlob ? 1 : 0);
      const uploaded = siteIds.length + billIds.length + (voiceId ? 1 : 0);
      // CONTRACT (WO-14): mediaIds carries photos first, voice last.
      const mediaIds: UUID[] = [...siteIds, ...billIds, ...(voiceId ? [voiceId] : [])];

      const trimmed = text.trim();
      const input: CreateProgressNoteInput = {
        id,
        siteId: siteId as UUID,
        text: trimmed || PHOTO_ONLY_NOTE_TEXT,
        businessDate: date,
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      };
      await api<ProgressNote>('POST', '/records/progress', input);
      return { failed: voiceFailed || uploaded < attempted };
    },
    onSuccess: ({ failed }) => {
      resetFields();
      setPhotoWarning(failed);
      setSaved(true);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const validate = (): boolean => {
    const hasPhotos = sitePhotos.length > 0 || billPhotos.length > 0;
    if (!text.trim() && !hasPhotos) {
      setTextError(m.PROGRESS_UI.textRequired);
      return false;
    }
    setTextError(null);
    return true;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    if (!siteId || !validate()) return;
    mutation.mutate();
  };

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="progress-text">{m.PROGRESS_UI.textLabel}</Label>
        <Textarea
          id="progress-text"
          data-testid="progress-text"
          placeholder={m.PROGRESS_UI.textPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {textError && (
          <p className="text-sm text-destructive" role="alert">
            {textError}
          </p>
        )}
      </div>

      <PhotoMultiField
        files={sitePhotos}
        onChange={setSitePhotos}
        max={MAX_SITE_PHOTOS}
        label={m.PROGRESS_UI.sitePhotosLabel}
        testId="progress-site-photos"
      />

      <PhotoMultiField
        files={billPhotos}
        onChange={setBillPhotos}
        max={MAX_BILL_PHOTOS}
        label={m.PROGRESS_UI.billPhotosLabel}
        testId="progress-bill-photos"
      />

      {voiceEnabled && <VoiceField value={voiceBlob} onChange={setVoiceBlob} testId="progress-voice" />}

      {serverError && (
        <Notice tone="error" testId="progress-error">
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId="progress-saved">
          {m.PROGRESS_UI.saved}
        </Notice>
      )}
      {photoWarning && (
        <Notice tone="warning" testId="progress-photo-warning">
          {m.PROGRESS_UI.photoNotUploaded}
        </Notice>
      )}

      <Button type="submit" data-testid="progress-submit" disabled={mutation.isPending || !siteId}>
        {mutation.isPending ? m.PROGRESS_UI.saving : m.PROGRESS_UI.submit}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Today's reports (who + time + text + attachment count)
// ---------------------------------------------------------------------------

function TodaysReports({
  notes,
  isLoading,
  error,
  onRetry,
  userName,
}: {
  notes: ProgressNote[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  userName: (id: UUID) => string;
}) {
  const m = useMessages();
  return (
    <Card size="sm" data-testid="progress-today-reports">
      <CardHeader>
        <CardTitle>{m.PROGRESS_UI.todaysReportsTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : notes.length === 0 ? (
          <EmptyState label={m.PROGRESS_UI.todaysReportsEmpty} />
        ) : (
          <ul className="divide-y">
            {notes.map((n) => (
              <ReportRow key={n.id} note={n} userName={userName} testId={`progress-today-row-${n.id}`} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Last-7-days history, grouped by day
// ---------------------------------------------------------------------------

function ProgressHistory({
  notes,
  isLoading,
  error,
  onRetry,
  userName,
}: {
  notes: ProgressNote[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  userName: (id: UUID) => string;
}) {
  const m = useMessages();
  const groups = useMemo(() => groupByBusinessDate(notes ?? []), [notes]);

  return (
    <Card size="sm" data-testid="progress-history">
      <CardHeader>
        <CardTitle>{m.PROGRESS_UI.historyTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : groups.length === 0 ? (
          <EmptyState label={m.PROGRESS_UI.historyEmpty} />
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <div key={g.date}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{formatBusinessDate(g.date)}</p>
                <ul className="divide-y" data-testid={`progress-history-day-${g.date}`}>
                  {g.notes.map((n) => (
                    <ReportRow key={n.id} note={n} userName={userName} testId={`progress-history-row-${n.id}`} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function groupByBusinessDate(notes: ProgressNote[]): { date: BusinessDate; notes: ProgressNote[] }[] {
  const byDate = new Map<BusinessDate, ProgressNote[]>();
  for (const n of notes) {
    const bucket = byDate.get(n.businessDate);
    if (bucket) bucket.push(n);
    else byDate.set(n.businessDate, [n]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // newest business date first
    .map(([date, dayNotes]) => ({ date, notes: dayNotes }));
}

/** Shared row: who + when + text + a generic attachment count (see the
 *  media-kind-display assumption in the file header — photo vs voice can't
 *  be told apart from GET /records/progress today). */
function ReportRow({
  note,
  userName,
  testId,
}: {
  note: ProgressNote;
  userName: (id: UUID) => string;
  testId: string;
}) {
  const m = useMessages();
  return (
    <li className="grid gap-1 py-2 first:pt-0 last:pb-0" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{userName(note.enteredBy)}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatKolkataDateTime(note.createdAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{note.text}</p>
      {note.mediaIds.length > 0 && (
        <span className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="size-3" aria-hidden="true" />
          {attachmentsLabel(note.mediaIds.length, m)}
        </span>
      )}
    </li>
  );
}

function attachmentsLabel(count: number, m: Messages): string {
  return `${count} ${m.PROGRESS_UI.attachmentsLabel}`;
}
