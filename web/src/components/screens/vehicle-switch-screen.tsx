'use client';

/**
 * WO-11 driver surface: self-switch onto another vehicle at the same site (instant,
 * when the target's TYPE is on the driver's allowed list), the damage-report form,
 * and the driver's own damage-report history (with a closing-remark button once SM
 * has resolved one). Lives on /driver/vehicle, stacked above the existing FuelScreen —
 * the most discoverable "my vehicle" surface a driver already visits daily (see the
 * module report for why this page over /driver/requests).
 *
 * "Needs approval" vehicles deep-link to the existing VEHICLE_SWITCH request form on
 * /driver/requests (RequestsScreen — owned by another wave) via a same-page anchor;
 * that screen is not touched here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { ISSUE_SEVERITIES } from '@techbuilder/contracts';
import type {
  CloseIssueInput,
  CreateIssueInput,
  Issue,
  IssueSeverity,
  UUID,
  Vehicle,
  VehicleSnapshot,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DamageTimeline } from '@/components/vehicle/damage-timeline';

export function VehicleSwitchScreen() {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const snapshotQ = useQuery({
    queryKey: ['vehicles', 'my-snapshot'],
    queryFn: () => api<VehicleSnapshot>('GET', '/vehicles/my-snapshot'),
    retry: false, // NOT_FOUND ("no vehicle yet") is an expected empty state, not a transient failure
  });
  const vehicle = snapshotQ.data?.vehicle ?? null;
  const noVehicle = snapshotQ.error instanceof ApiClientError && snapshotQ.error.code === 'NOT_FOUND';

  const vehiclesQ = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api<Vehicle[]>('GET', '/vehicles'),
    enabled: !!vehicle,
  });

  // Last 180 days of the driver's OWN raised issues (records.listRecords scopes DRIVER
  // to createdBy=self regardless of window) — long enough to show real damage history.
  const myIssuesQ = useQuery({
    queryKey: ['records', 'issue', 'mine'],
    queryFn: () => {
      const qs = new URLSearchParams({ from: addDays(today, -180), to: today });
      return api<Issue[]>('GET', `/records/issue?${qs}`);
    },
  });

  const allowedTypes = new Set(meQ.data?.user.allowedVehicleTypeIds ?? []);
  const otherVehicles = (vehiclesQ.data ?? []).filter((v) => v.id !== vehicle?.id);

  const invalidateAfterSwitch = () => {
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  return (
    <div className="grid gap-4" data-testid="vehicle-switch-screen">
      <Card>
        <CardHeader>
          <CardTitle>{w.switchTitle}</CardTitle>
          <CardDescription>{w.switchSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshotQ.isPending || meQ.isPending ? (
            <LoadingState />
          ) : noVehicle ? (
            <EmptyState label={m.DRIVER_DAY_UI.noVehicleAssigned} />
          ) : snapshotQ.error ? (
            <ErrorState error={snapshotQ.error} onRetry={() => void snapshotQ.refetch()} />
          ) : vehiclesQ.isPending ? (
            <LoadingState />
          ) : vehiclesQ.error ? (
            <ErrorState error={vehiclesQ.error} onRetry={() => void vehiclesQ.refetch()} />
          ) : otherVehicles.length === 0 ? (
            <EmptyState label={w.switchListEmpty} />
          ) : (
            <ul className="divide-y" data-testid="switch-vehicle-list">
              {otherVehicles.map((v) => (
                <SwitchVehicleRow
                  key={v.id}
                  vehicle={v}
                  allowed={allowedTypes.has(v.vehicleTypeId)}
                  onSwitched={invalidateAfterSwitch}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {vehicle && <DamageReportForm vehicleId={vehicle.id} today={today} onSaved={() => void myIssuesQ.refetch()} />}

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

// ---------------------------------------------------------------------------
// Switch section: one row per other site vehicle
// ---------------------------------------------------------------------------

function SwitchVehicleRow({
  vehicle,
  allowed,
  onSwitched,
}: {
  vehicle: Vehicle;
  allowed: boolean;
  onSwitched: () => void;
}) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [done, setDone] = useState(false);

  const doSwitch = useMutation({
    mutationFn: () => api<Vehicle>('POST', `/vehicles/${vehicle.id}/switch`),
    onSuccess: () => {
      setDone(true);
      onSwitched();
    },
  });

  const serverError =
    doSwitch.error instanceof ApiClientError
      ? apiErrorMessage(m, doSwitch.error.code)
      : doSwitch.error
        ? apiErrorMessage(m)
        : null;

  return (
    <li className="grid gap-1.5 py-3 first:pt-0 last:pb-0" data-testid={`switch-vehicle-${vehicle.id}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {vehicle.regNo}
          {vehicle.name && <span className="ml-1.5 font-normal text-muted-foreground">· {vehicle.name}</span>}
        </p>
        {allowed ? (
          <Button
            type="button"
            size="sm"
            data-testid={`switch-vehicle-${vehicle.id}-submit`}
            disabled={doSwitch.isPending || done}
            onClick={() => doSwitch.mutate()}
          >
            {doSwitch.isPending ? w.switchNowBusy : w.switchNow}
          </Button>
        ) : (
          <Link
            href="/driver/requests#request-vehicle"
            data-testid={`switch-vehicle-${vehicle.id}-request`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {w.needsApproval}
          </Link>
        )}
      </div>
      {serverError && (
        <Notice tone="error" testId={`switch-vehicle-${vehicle.id}-error`}>
          {serverError}
        </Notice>
      )}
      {done && (
        <Notice tone="success" testId={`switch-vehicle-${vehicle.id}-done`}>
          {w.switchNowDone}
        </Notice>
      )}
    </li>
  );
}

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
