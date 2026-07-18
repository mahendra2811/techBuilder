'use client';

/**
 * Driver damage-report page (/driver/damage) — DRV-2/DRV-3
 * (docs/role-page-map/driver/driver-role-updates.md, frozen.10): split out of
 * the old combined `/driver/vehicle` page. Damage form on top, his own damage
 * history (last 180 days) below it — logic moved verbatim out of
 * `vehicle-switch-screen.tsx` (that screen now hosts the vehicle-switch
 * functionality only, see task DRV-2).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { ISSUE_SEVERITIES } from '@techbuilder/contracts';
import type { CreateIssueInput, Issue, IssueSeverity, UUID, VehicleSnapshot } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DamageTimeline } from '@/components/vehicle/damage-timeline';
import { CloseIssueInline } from '@/components/vehicle/close-issue-inline';

export function DriverDamageScreen() {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const today = useMemo(() => todayKolkata(), []);

  const snapshotQ = useQuery({
    queryKey: ['vehicles', 'my-snapshot'],
    queryFn: () => api<VehicleSnapshot>('GET', '/vehicles/my-snapshot'),
    retry: false, // NOT_FOUND ("no vehicle yet") is an expected empty state, not a transient failure
  });
  const vehicle = snapshotQ.data?.vehicle ?? null;
  const noVehicle = snapshotQ.error instanceof ApiClientError && snapshotQ.error.code === 'NOT_FOUND';

  // Last 180 days of the driver's OWN raised issues (records.listRecords scopes DRIVER
  // to createdBy=self regardless of window) — long enough to show real damage history.
  const myIssuesQ = useQuery({
    queryKey: ['records', 'issue', 'mine'],
    queryFn: () => {
      const qs = new URLSearchParams({ from: addDays(today, -180), to: today });
      return api<Issue[]>('GET', `/records/issue?${qs}`);
    },
  });

  return (
    <div className="grid gap-4" data-testid="driver-damage-screen">
      {snapshotQ.isPending ? (
        <Card>
          <CardContent className="pt-6">
            <LoadingState />
          </CardContent>
        </Card>
      ) : noVehicle ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
          </CardContent>
        </Card>
      ) : snapshotQ.error ? (
        <Card>
          <CardContent className="pt-6">
            <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
          </CardContent>
        </Card>
      ) : (
        vehicle && <DamageReportForm vehicleId={vehicle.id} today={today} onSaved={() => void myIssuesQ.refetch()} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{w.damageHistoryTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <DamageTimeline
            issues={myIssuesQ.data}
            isLoading={myIssuesQ.isPending}
            error={myIssuesQ.error}
            onRetry={() => void myIssuesQ.refetch()}
            testId="my-damage"
            renderExtra={(issue) =>
              issue.status === 'RESOLVED' && !issue.closingNote ? (
                <CloseIssueInline issue={issue} onClosed={() => void myIssuesQ.refetch()} />
              ) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Note: CloseIssueInline (the closing-remark action on a RESOLVED issue) now lives at
// `@/components/vehicle/close-issue-inline` — shared with `supervisor-damage-screen.tsx`.

// ---------------------------------------------------------------------------
// Damage report form
// ---------------------------------------------------------------------------

function DamageReportForm({
  vehicleId,
  today,
  onSaved,
}: {
  vehicleId: UUID;
  today: string;
  onSaved: () => void;
}) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;

  const [severity, setSeverity] = useState<IssueSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mediaWarning, setMediaWarning] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      let mediaFailed = false;
      const photoIds = await uploadPhotos(photos, { kind: 'PHOTO', parentType: 'issue', parentId: id });
      if (photoIds.length < photos.length) mediaFailed = true;
      let voiceId: UUID | null = null;
      if (voice) {
        voiceId = await uploadVoice(voice, { parentType: 'issue', parentId: id });
        if (!voiceId) mediaFailed = true;
      }
      const input: CreateIssueInput = {
        id,
        vehicleId,
        severity,
        description: description.trim(),
        businessDate: today,
        mediaIds: voiceId ? [...photoIds, voiceId] : photoIds,
      };
      await api<Issue>('POST', '/records/issue', input);
      return { mediaFailed };
    },
    onSuccess: ({ mediaFailed }) => {
      setSaved(true);
      setMediaWarning(mediaFailed);
      setSeverity('LOW');
      setDescription('');
      setPhotos([]);
      setVoice(null);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const serverError =
    submit.error instanceof ApiClientError ? apiErrorMessage(m, submit.error.code) : submit.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="report-damage">
      <CardHeader>
        <CardTitle>{w.reportDamageTitle}</CardTitle>
        <CardDescription>{w.reportDamageSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            if (!description.trim()) {
              setDescriptionError(w.descriptionRequired);
              return;
            }
            setDescriptionError(null);
            submit.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="damage-severity">{w.severityLabel}</Label>
            <NativeSelect
              id="damage-severity"
              data-testid="damage-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
            >
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {w.SEVERITY_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="damage-description">{w.descriptionLabel}</Label>
            <Textarea
              id="damage-description"
              data-testid="damage-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) setDescriptionError(null);
              }}
            />
            {descriptionError && (
              <p className="text-sm text-destructive" role="alert">
                {descriptionError}
              </p>
            )}
          </div>

          <PhotoMultiField files={photos} onChange={setPhotos} max={4} testId="damage-photos" />

          <VoiceField value={voice} onChange={setVoice} testId="damage-voice" />

          {serverError && (
            <Notice tone="error" testId="report-damage-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="report-damage-success">
              {w.reportSaved}
            </Notice>
          )}
          {mediaWarning && (
            <Notice tone="warning" testId="report-damage-media-warning">
              {m.ENTRY_UI.photoNotUploaded}
            </Notice>
          )}

          <Button type="submit" data-testid="report-damage-submit" disabled={submit.isPending}>
            {submit.isPending ? w.reportSubmitting : w.reportSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Driver: closing remark on a RESOLVED issue they raised
// ---------------------------------------------------------------------------

function CloseIssueInline({ issue, onClosed }: { issue: Issue; onClosed: () => void }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  const close = useMutation({
    mutationFn: (input: CloseIssueInput) => api<Issue>('POST', `/records/issue/${issue.id}/close`, input),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      onClosed();
    },
  });

  const serverError =
    close.error instanceof ApiClientError ? apiErrorMessage(m, close.error.code) : close.error ? apiErrorMessage(m) : null;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        data-testid={`close-issue-${issue.id}-open`}
        onClick={() => setOpen(true)}
      >
        {w.closeButton}
      </Button>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-2.5" data-testid={`close-issue-${issue.id}`}>
      <Label htmlFor={`close-note-${issue.id}`}>{w.closeNoteLabel}</Label>
      <Textarea
        id={`close-note-${issue.id}`}
        data-testid={`close-note-${issue.id}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {serverError && (
        <Notice tone="error" testId={`close-issue-${issue.id}-error`}>
          {serverError}
        </Notice>
      )}
      <Button
        type="button"
        size="sm"
        className="w-fit"
        data-testid={`close-issue-${issue.id}-submit`}
        disabled={close.isPending}
        onClick={() => close.mutate({ closingNote: note.trim() ? note.trim() : undefined })}
      >
        {close.isPending ? w.closeSubmitting : w.closeSubmit}
      </Button>
    </div>
  );
}
