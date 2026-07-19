'use client';

/**
 * Supervisor damage-report page (/supervisor/damage) — SUPERVISOR restructure.
 * Damage form on top (vehicle select over his crew/site vehicles + severity + description +
 * optional photos/voice, same shape as `driver-damage-screen.tsx`'s form) — submits to the
 * SAME `POST /records/issue` endpoint the driver form and the old dashboard mini-form used.
 * His damage history (last 180 days, across his crew's vehicles) below it, rendered with the
 * shared `DamageTimeline`.
 *
 * This is the richer replacement for the compact damage mini-form that used to live below the
 * vehicle list on the dashboard card (`supervisor-crew-vehicles-card.tsx`, now vehicles-only at
 * /supervisor/vehicle) — see that file's header comment.
 *
 * Backend rule (`backend/src/records/records.service.ts`):
 *  - `resolveIssue` (OPEN → RESOLVED) is SITE_MANAGER (own site) / OWNER (any) ONLY —
 *    a SUPERVISOR can never resolve a damage report, his own or anyone else's.
 *  - `closeIssue` (add an optional closing remark once RESOLVED) is CREATOR-only, regardless
 *    of role (`row.createdBy === p.userId`).
 * So the history below is READ-ONLY except for the one action a SUPERVISOR is ever permitted:
 * closing a RESOLVED issue that HE personally raised — gated below on `issue.createdBy === me`
 * in addition to `status === 'RESOLVED' && !closingNote`, via the shared `CloseIssueInline`.
 *
 * All strings are module-local (this file predates + does not touch the frozen
 * `VEHICLE_WAVE_UI` i18n catalog used by `DamageTimeline`/`CloseIssueInline` for the shared
 * severity/status/timeline labels) — same convention as `supervisor-crew-vehicles-card.tsx`.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { ISSUE_SEVERITIES } from '@techbuilder/contracts';
import type { CreateIssueInput, Issue, IssueSeverity, UUID, Vehicle } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { apiErrorOf, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { FormStatus } from '@/components/entry/form-status';
import { DamageTimeline } from '@/components/vehicle/damage-timeline';
import { CloseIssueInline } from '@/components/vehicle/close-issue-inline';

const UI = {
  en: {
    formTitle: 'Report damage',
    formSubtitle: 'Raise a damage report for a crew vehicle',
    vehicleLabel: 'Vehicle',
    noVehicles: 'No vehicles for your crew yet',
    severityLabel: 'Severity',
    severityLow: 'Low',
    severityMedium: 'Medium',
    severityHigh: 'High',
    descriptionLabel: 'What happened?',
    descriptionRequired: 'Describe the damage',
    submit: 'Submit',
    submitting: 'Saving…',
    saved: 'Damage report saved.',
    historyTitle: 'Damage history',
  },
  hi: {
    formTitle: 'नुक़सान बताएँ',
    formSubtitle: 'क्रू के किसी वाहन का नुक़सान दर्ज करें',
    vehicleLabel: 'वाहन',
    noVehicles: 'आपके क्रू के लिए अभी कोई वाहन नहीं',
    severityLabel: 'गंभीरता',
    severityLow: 'कम',
    severityMedium: 'मध्यम',
    severityHigh: 'ज़्यादा',
    descriptionLabel: 'क्या हुआ?',
    descriptionRequired: 'नुक़सान के बारे में बताएँ',
    submit: 'भेजें',
    submitting: 'सहेजा जा रहा है…',
    saved: 'नुक़सान की रिपोर्ट सहेज ली गई।',
    historyTitle: 'नुक़सान का इतिहास',
  },
} as const;

type UiText = UiStrings<typeof UI>;

const vehicleLabel = (v: Vehicle) => (v.name ? `${v.regNo} · ${v.name}` : v.regNo);

export function SupervisorDamageScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const today = useMemo(() => todayKolkata(), []);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const myUserId = meQ.data?.user.id;

  // Server-scoped to the supervisor's own crew/site (same as supervisor-crew-vehicles-card.tsx).
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const vehicles = vehiclesQ.data ?? [];

  // Last 180 days of issues visible to the supervisor (site-scoped OR his own — same query
  // shape as driver-damage-screen.tsx's "mine" history, just a different scope server-side).
  const issuesQ = useQuery({
    queryKey: ['records', 'issue', 'crew'],
    queryFn: () => {
      const qs = new URLSearchParams({ from: addDays(today, -180), to: today });
      return api<Issue[]>('GET', `/records/issue?${qs}`);
    },
  });

  return (
    <div className="grid gap-4" data-testid="supervisor-damage-screen">
      <DamageReportForm
        ui={ui}
        vehicles={vehicles}
        vehiclesLoading={vehiclesQ.isPending}
        vehiclesError={vehiclesQ.error}
        today={today}
        onSaved={() => void issuesQ.refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle>{ui.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <DamageTimeline
            issues={issuesQ.data}
            isLoading={issuesQ.isPending}
            error={issuesQ.error}
            onRetry={() => void issuesQ.refetch()}
            testId="supervisor-damage-history"
            renderExtra={(issue) =>
              issue.status === 'RESOLVED' && !issue.closingNote && issue.createdBy === myUserId ? (
                <CloseIssueInline issue={issue} onClosed={() => void issuesQ.refetch()} />
              ) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Damage report form
// ---------------------------------------------------------------------------

function DamageReportForm({
  ui,
  vehicles,
  vehiclesLoading,
  vehiclesError,
  today,
  onSaved,
}: {
  ui: UiText;
  vehicles: Vehicle[];
  vehiclesLoading: boolean;
  vehiclesError: unknown;
  today: string;
  onSaved: () => void;
}) {
  const m = useMessages();

  const [vehicleId, setVehicleId] = useState<UUID | ''>('');
  const [severity, setSeverity] = useState<IssueSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mediaWarning, setMediaWarning] = useState(false);

  const effectiveVehicleId = vehicleId !== '' ? vehicleId : (vehicles[0]?.id ?? '');

  const severityText = (s: IssueSeverity): string =>
    s === 'LOW' ? ui.severityLow : s === 'MEDIUM' ? ui.severityMedium : ui.severityHigh;

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
        vehicleId: effectiveVehicleId,
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
    apiErrorOf(m, submit.error);

  return (
    <Card data-testid="supervisor-damage-form">
      <CardHeader>
        <CardTitle>{ui.formTitle}</CardTitle>
        <CardDescription>{ui.formSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {vehiclesLoading ? (
          <LoadingState />
        ) : vehiclesError ? (
          <ErrorState error={vehiclesError} />
        ) : vehicles.length === 0 ? (
          <EmptyState label={ui.noVehicles} />
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              if (!description.trim()) {
                setDescriptionError(ui.descriptionRequired);
                return;
              }
              if (!effectiveVehicleId) return;
              setDescriptionError(null);
              submit.mutate();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-vehicle">{ui.vehicleLabel}</Label>
              <NativeSelect
                id="supervisor-damage-vehicle"
                data-testid="supervisor-damage-vehicle"
                value={effectiveVehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-severity">{ui.severityLabel}</Label>
              <NativeSelect
                id="supervisor-damage-severity"
                data-testid="supervisor-damage-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              >
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {severityText(s)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="supervisor-damage-description">{ui.descriptionLabel}</Label>
              <Textarea
                id="supervisor-damage-description"
                data-testid="supervisor-damage-description"
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

            <PhotoMultiField files={photos} onChange={setPhotos} max={4} testId="supervisor-damage-photos" />

            <VoiceField value={voice} onChange={setVoice} testId="supervisor-damage-voice" />

                          <FormStatus error={serverError} saved={saved} savedLabel={ui.saved} testIdPrefix="supervisor-damage" />
            {mediaWarning && (
              <Notice tone="warning" testId="supervisor-damage-media-warning">
                {m.ENTRY_UI.photoNotUploaded}
              </Notice>
            )}

            <Button
              type="submit"
              data-testid="supervisor-damage-submit"
              disabled={submit.isPending || !effectiveVehicleId}
            >
              {submit.isPending ? ui.submitting : ui.submit}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
