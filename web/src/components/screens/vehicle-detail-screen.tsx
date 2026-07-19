'use client';

/**
 * WO-12 fleet drill-down (Owner + Site Manager — one component, two thin route
 * wrappers under owner/fleet/[id] and site-manager/fleet/[id]). GET /vehicles/:id/detail
 * is scope-enforced server-side (own-site SM / any-vehicle Owner), so this screen
 * just renders whatever comes back.
 *
 * `expenses` on VehicleDetail is always [] in this schema version — the `expenses`
 * table has no `vehicleId` column, so there is nothing to render for that section
 * (see the module report for the flag). Fuel is the vehicle's real cost signal here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import {
  REMINDER_KINDS,
  REMINDER_RECURRENCES,
  VEHICLE_DOC_KINDS,
  type CreateVehicleDocumentInput,
  type CreateVehicleReminderInput,
  type FuelIssuance,
  type FuelLog,
  type Issue,
  type MaterialTxnStatus,
  type Person,
  type ReminderKind,
  type ReminderRecurrence,
  type ResolveIssueInput,
  type UpdateVehicleReminderInput,
  type User,
  type VehicleDetail,
  type VehicleDocKind,
  type VehicleDocument,
  type VehicleReminder,
} from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { apiErrorOf } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { uploadPhoto } from '@/lib/media-upload';
import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PhotoField } from '@/components/entry/photo-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { DamageTimeline } from '@/components/vehicle/damage-timeline';

/**
 * CW-12 — per-vehicle document vault + expiry/EMI reminders. SM + Owner ONLY per the
 * client's explicit demand. This screen's TWO route wrappers
 * (owner/fleet/[id]/page.tsx, site-manager/fleet/[id]/page.tsx) are the ONLY places
 * `VehicleDetailScreen` is mounted anywhere in the app — no other role has a nav path or
 * route to it — so there is no "other variant" to gate against client-side the way
 * `FleetScreen`/`role` does. The real enforcement is server-side: `GET/POST
 * /vehicles/:id/docs` + `/reminders` re-derive the caller's role fresh from the DB
 * (`VehicleDocsService`) and throw FORBIDDEN for anyone but SITE_MANAGER/OWNER, so even a
 * stray link here would render an error, not data.
 */
const VEHICLE_DOCS_UI = {
  en: {
    docsTitle: 'Documents',
    remindersTitle: 'Reminders',
    docsEmpty: 'No documents yet',
    remindersEmpty: 'No reminders yet',
    kindLabels: { RC: 'RC', INSURANCE: 'Insurance', PUC: 'PUC', FITNESS: 'Fitness', PERMIT: 'Permit', OTHER: 'Other' } as Record<
      VehicleDocKind,
      string
    >,
    reminderKindLabels: { EXPIRY: 'Expiry', EMI: 'EMI', CUSTOM: 'Custom' } as Record<ReminderKind, string>,
    recurrenceLabels: { ONCE: 'Once', MONTHLY: 'Monthly', YEARLY: 'Yearly' } as Record<ReminderRecurrence, string>,
    addDoc: 'Add document',
    titleLabel: 'Title',
    kindLabel: 'Type',
    expiryLabel: 'Expiry date (optional)',
    noteLabel: 'Note (optional)',
    fileLabel: 'File (optional)',
    fileUploadFailed: 'File upload failed — document saved without it',
    fileUploaded: 'File uploaded — no preview available yet',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    titleRequired: 'Title is required',
    addReminder: 'Add reminder',
    emiPreset: 'EMI (monthly)',
    labelLabel: 'Label',
    reminderKindLabel: 'Type',
    dueDateLabel: 'Due date',
    recurrenceLabel: 'Repeats',
    remindDaysLabel: 'Remind days before',
    activeLabel: 'Active',
    labelRequired: 'Label is required',
    dueDateRequired: 'Due date is required',
    inactiveTag: 'Inactive',
    everyLabel: 'every',
    daysBeforeSuffix: 'day(s) before',
  },
  hi: {
    docsTitle: 'दस्तावेज़',
    remindersTitle: 'याद दिलाना',
    docsEmpty: 'अभी तक कोई दस्तावेज़ नहीं',
    remindersEmpty: 'अभी तक कोई रिमाइंडर नहीं',
    kindLabels: { RC: 'आरसी', INSURANCE: 'बीमा', PUC: 'पीयूसी', FITNESS: 'फिटनेस', PERMIT: 'परमिट', OTHER: 'अन्य' } as Record<
      VehicleDocKind,
      string
    >,
    reminderKindLabels: { EXPIRY: 'समाप्ति', EMI: 'किस्त (EMI)', CUSTOM: 'अन्य' } as Record<ReminderKind, string>,
    recurrenceLabels: { ONCE: 'एक बार', MONTHLY: 'हर महीने', YEARLY: 'हर साल' } as Record<ReminderRecurrence, string>,
    addDoc: 'दस्तावेज़ जोड़ें',
    titleLabel: 'शीर्षक',
    kindLabel: 'प्रकार',
    expiryLabel: 'समाप्ति तारीख़ (वैकल्पिक)',
    noteLabel: 'टिप्पणी (वैकल्पिक)',
    fileLabel: 'फ़ाइल (वैकल्पिक)',
    fileUploadFailed: 'फ़ाइल अपलोड नहीं हुई — दस्तावेज़ बिना फ़ाइल के सहेजा गया',
    fileUploaded: 'फ़ाइल अपलोड हुई — अभी पूर्वावलोकन उपलब्ध नहीं',
    save: 'सहेजें',
    saving: 'सहेज रहे हैं…',
    cancel: 'रद्द करें',
    delete: 'हटाएँ',
    titleRequired: 'शीर्षक ज़रूरी है',
    addReminder: 'रिमाइंडर जोड़ें',
    emiPreset: 'किस्त (हर महीने)',
    labelLabel: 'लेबल',
    reminderKindLabel: 'प्रकार',
    dueDateLabel: 'तारीख़',
    recurrenceLabel: 'दोहराव',
    remindDaysLabel: 'कितने दिन पहले याद दिलाएँ',
    activeLabel: 'सक्रिय',
    labelRequired: 'लेबल ज़रूरी है',
    dueDateRequired: 'तारीख़ ज़रूरी है',
    inactiveTag: 'निष्क्रिय',
    everyLabel: 'हर',
    daysBeforeSuffix: 'दिन पहले',
  },
} as const;

/** CW-5: per-vehicle diesel double-check (supervisor's issuance vs the driver's own fuel entry). */
const DIESEL_MATCH_UI = {
  en: {
    title: 'Diesel match',
    empty: 'No diesel entries yet',
    issuedLabel: 'issued',
    receivedLabel: 'received',
    litresSuffix: 'L',
    statusConfirmed: 'confirmed',
    statusMismatch: 'mismatch',
    statusPending: 'waiting',
  },
  hi: {
    title: 'डीज़ल मिलान',
    empty: 'अभी तक कोई डीज़ल एंट्री नहीं',
    issuedLabel: 'दिया',
    receivedLabel: 'मिला',
    litresSuffix: 'लीटर',
    statusConfirmed: 'मिलान हो गया',
    statusMismatch: 'बेमेल',
    statusPending: 'प्रतीक्षा में',
  },
} as const;

export function VehicleDetailScreen({ vehicleId, backHref }: { vehicleId: string; backHref: string }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;

  const detailQ = useQuery({
    queryKey: ['vehicles', vehicleId, 'detail'],
    queryFn: () => api<VehicleDetail>('GET', `/vehicles/${vehicleId}/detail`),
  });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });

  const vehicle = detailQ.data?.vehicle;
  const analytics = detailQ.data?.analytics;
  const driverPersonId = vehicle?.assignedDriverPersonId ?? null;
  const driverPerson = driverPersonId ? peopleQ.data?.find((p) => p.id === driverPersonId) : undefined;
  const driverUser = driverPersonId
    ? usersQ.data?.find((u) => u.personId === driverPersonId && u.role === 'DRIVER')
    : undefined;

  return (
    <div className="grid gap-4" data-testid="vehicle-detail">
      <Link
        href={backHref}
        data-testid="vehicle-detail-back"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {w.vehicleDetailBack}
      </Link>

      <Card>
        <CardHeader>
          {detailQ.isPending ? (
            <LoadingState />
          ) : detailQ.error ? (
            <ErrorState error={detailQ.error} onRetry={() => void detailQ.refetch()} />
          ) : vehicle ? (
            <CardTitle data-testid="vehicle-detail-title">
              {vehicle.regNo}
              {vehicle.name && <span className="ml-1.5 font-normal text-muted-foreground">· {vehicle.name}</span>}
            </CardTitle>
          ) : (
            <EmptyState label={w.vehicleNotFound} />
          )}
        </CardHeader>

        {vehicle && analytics && detailQ.data && (
          <CardContent className="grid gap-5">
            <p className="text-sm" data-testid="vehicle-current-driver">
              {w.currentDriverLabel}: {driverPerson?.name ?? w.noDriverAssigned}
              {driverUser && (
                <Link
                  href={`${backHref}/driver/${driverUser.id}`}
                  data-testid="vehicle-view-driver-link"
                  className="ml-2 text-xs underline"
                >
                  {w.viewDriverLink}
                </Link>
              )}
            </p>

            <Separator />

            <div>
              <p className="mb-2 text-sm font-medium">{w.analyticsTitle}</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label={w.avgRunPerDay7} value={analytics.avgRunPerDay7} noData={w.noData} testId="vehicle-avg-7" />
                <Stat label={w.avgRunPerDay30} value={analytics.avgRunPerDay30} noData={w.noData} testId="vehicle-avg-30" />
                <Stat label={w.avgRunPerDay90} value={analytics.avgRunPerDay90} noData={w.noData} testId="vehicle-avg-90" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{w.fuel30Title}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-fuel-30">
                    {analytics.fuelLitres30} {w.fuelLitresSuffix}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatPaise(analytics.fuelPaise30)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{w.monthlyCostTitle}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-monthly-cost">
                    {formatPaise(analytics.monthlyCostPaise)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{w.totalCostTitle}</p>
                  <p className="text-lg font-semibold" data-testid="vehicle-total-cost">
                    {formatPaise(analytics.totalExpensePaise)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <Section title={w.damageHistoryTitle}>
              <DamageTimeline
                issues={detailQ.data.damages}
                isLoading={false}
                testId="vehicle-damage"
                renderExtra={(issue) =>
                  issue.status === 'OPEN' ? (
                    <ResolveIssueInline issue={issue} onResolved={() => void detailQ.refetch()} />
                  ) : null
                }
              />
            </Section>

            <Separator />

            <Section title={w.logsTitle}>
              {detailQ.data.logs.length === 0 ? (
                <EmptyState label={w.logsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-logs">
                  {detailQ.data.logs.map((l) => (
                    <li key={l.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {formatBusinessDateShort(l.businessDate)} · {l.startReading}
                        {l.endReading != null ? ` → ${l.endReading}` : ''}
                      </p>
                      {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Separator />

            <Section title={w.fuelTitle}>
              {detailQ.data.fuel.length === 0 ? (
                <EmptyState label={w.fuelEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-fuel">
                  {detailQ.data.fuel.map((f) => (
                    <li key={f.id} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                      <span>
                        {formatBusinessDateShort(f.businessDate)} · {f.litres} {w.fuelLitresSuffix}
                      </span>
                      <span className="font-medium">{f.amountPaise != null ? formatPaise(f.amountPaise) : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Separator />

            <DieselMatchSection vehicleId={vehicleId} fuel={detailQ.data.fuel} />

            <Separator />

            <Section title={w.tripsTitle}>
              {detailQ.data.trips.length === 0 ? (
                <EmptyState label={w.tripsEmpty} />
              ) : (
                <ul className="divide-y" data-testid="vehicle-trips">
                  {detailQ.data.trips.map((t) => (
                    <li key={t.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                      <p>
                        {t.fromText} → {t.toText}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBusinessDateShort(t.businessDate)}
                        {t.purpose ? ` · ${t.purpose}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Separator />

            <VehicleDocumentsSection vehicleId={vehicleId} />

            <Separator />

            <VehicleRemindersSection vehicleId={vehicleId} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, noData, testId }: { label: string; value: number | null; noData: string; testId: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold" data-testid={testId}>
        {value != null ? value.toFixed(1) : noData}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CW-5 — per-vehicle diesel double-check (supervisor's issuance vs the
// driver's own fuel entry). `fuel` is the FuelLog[] this screen already loads
// via VehicleDetail; only the issuances need a dedicated fetch.
// ---------------------------------------------------------------------------

function DieselMatchSection({ vehicleId, fuel }: { vehicleId: string; fuel: FuelLog[] }) {
  const locale = useLocale();
  const ui = DIESEL_MATCH_UI[locale];

  const issuancesQ = useQuery({
    queryKey: ['fuel-stock', 'issuances', vehicleId],
    queryFn: () => api<FuelIssuance[]>('GET', `/fuel-stock/issuances?vehicleId=${vehicleId}`),
  });

  const rows = useMemo(() => {
    const map = new Map<string, { issued: number | null; received: number | null; status: MaterialTxnStatus }>();
    for (const i of issuancesQ.data ?? []) {
      const e = map.get(i.businessDate) ?? { issued: null, received: null, status: i.status };
      e.issued = i.litres;
      e.status = i.status;
      map.set(i.businessDate, e);
    }
    for (const f of fuel) {
      const e = map.get(f.businessDate) ?? { issued: null, received: null, status: f.status };
      e.received = f.litres;
      if (e.issued === null) e.status = f.status;
      map.set(f.businessDate, e);
    }
    return Array.from(map.entries())
      .map(([businessDate, v]) => ({ businessDate, ...v }))
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }, [issuancesQ.data, fuel]);

  return (
    <Section title={ui.title}>
      {issuancesQ.isPending ? (
        <LoadingState />
      ) : issuancesQ.error ? (
        <ErrorState error={issuancesQ.error} onRetry={() => void issuancesQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState label={ui.empty} />
      ) : (
        <ul className="divide-y" data-testid="vehicle-diesel-match">
          {rows.map((r) => {
            const isMismatch = r.status === 'MISMATCH';
            const isConfirmed = r.status === 'CONFIRMED';
            return (
              <li
                key={r.businessDate}
                className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                data-testid={`vehicle-diesel-match-${r.businessDate}`}
              >
                <div className="min-w-0">
                  <p>{formatBusinessDateShort(r.businessDate)}</p>
                  <p className="text-xs text-muted-foreground">
                    {ui.issuedLabel} {r.issued ?? '—'} {ui.litresSuffix} / {ui.receivedLabel} {r.received ?? '—'} {ui.litresSuffix}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                    isMismatch && 'bg-destructive/10 text-destructive',
                    isConfirmed && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                    !isMismatch && !isConfirmed && 'bg-amber-500/10 text-amber-800 dark:text-amber-400',
                  )}
                >
                  {isMismatch ? `🚩 ${ui.statusMismatch}` : isConfirmed ? `✓ ${ui.statusConfirmed}` : ui.statusPending}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// SM / Owner inline resolve form (shown on OPEN damage reports)
// ---------------------------------------------------------------------------

function ResolveIssueInline({ issue, onResolved }: { issue: Issue; onResolved: () => void }) {
  const m = useMessages();
  const w = m.VEHICLE_WAVE_UI;
  const [note, setNote] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: (input: ResolveIssueInput) => api<Issue>('POST', `/records/issue/${issue.id}/resolve`, input),
    onSuccess: () => {
      setNote('');
      onResolved();
    },
  });

  const serverError =
    apiErrorOf(m, resolve.error);

  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-2.5" data-testid={`resolve-issue-${issue.id}`}>
      <Label htmlFor={`resolve-note-${issue.id}`}>{w.resolutionNoteLabel}</Label>
      <Textarea
        id={`resolve-note-${issue.id}`}
        data-testid={`resolve-note-${issue.id}`}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (fieldError) setFieldError(null);
        }}
      />
      {fieldError && (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      )}
      {serverError && (
        <Notice tone="error" testId={`resolve-issue-${issue.id}-error`}>
          {serverError}
        </Notice>
      )}
      <Button
        type="button"
        size="sm"
        className="w-fit"
        data-testid={`resolve-issue-${issue.id}-submit`}
        disabled={resolve.isPending}
        onClick={() => {
          if (!note.trim()) {
            setFieldError(w.resolutionNoteRequired);
            return;
          }
          resolve.mutate({ resolutionNote: note.trim() });
        }}
      >
        {resolve.isPending ? w.resolveSubmitting : w.resolveSubmit}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CW-12 — per-vehicle document vault (SM + Owner only; see the file-header note)
// ---------------------------------------------------------------------------

function VehicleDocumentsSection({ vehicleId }: { vehicleId: string }) {
  const m = useMessages();
  const locale = useLocale();
  const ui = VEHICLE_DOCS_UI[locale];
  const qc = useQueryClient();
  const docsKey = ['vehicles', vehicleId, 'docs'];

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<VehicleDocKind>('RC');
  const [expiryDate, setExpiryDate] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const docsQ = useQuery({
    queryKey: docsKey,
    queryFn: () => api<VehicleDocument[]>('GET', `/vehicles/${vehicleId}/docs`),
  });

  const create = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      let mediaId: string | undefined;
      if (file) {
        const uploaded = await uploadPhoto(file, { kind: 'PHOTO', parentType: 'vehicleDocument', parentId: id });
        if (uploaded) mediaId = uploaded;
        else setUploadNotice(ui.fileUploadFailed);
      }
      const input: CreateVehicleDocumentInput = {
        id,
        vehicleId,
        kind,
        title: title.trim(),
        ...(mediaId ? { mediaId } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      return api<VehicleDocument>('POST', `/vehicles/${vehicleId}/docs`, input);
    },
    onSuccess: () => {
      setTitle('');
      setKind('RC');
      setExpiryDate('');
      setNote('');
      setFile(null);
      setShowForm(false);
      void qc.invalidateQueries({ queryKey: docsKey });
      void qc.invalidateQueries({ queryKey: ['vehicles', vehicleId, 'reminders'] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/vehicle-docs/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: docsKey }),
  });

  const serverError =
    apiErrorOf(m, create.error);
  const today = todayKolkata();
  const soonCutoff = addDays(today, 30);

  return (
    <Section title={ui.docsTitle}>
      {docsQ.isPending ? (
        <LoadingState />
      ) : docsQ.error ? (
        <ErrorState error={docsQ.error} onRetry={() => void docsQ.refetch()} />
      ) : docsQ.data && docsQ.data.length === 0 && !showForm ? (
        <EmptyState label={ui.docsEmpty} />
      ) : (
        docsQ.data && (
          <ul className="divide-y" data-testid="vehicle-docs">
            {docsQ.data.map((d) => {
              const expiringSoon = !!d.expiryDate && d.expiryDate <= soonCutoff;
              return (
                <li key={d.id} className="grid gap-1 py-2.5 text-sm first:pt-0 last:pb-0" data-testid={`vehicle-doc-${d.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {ui.kindLabels[d.kind]}
                      </span>
                      <span className="min-w-0 truncate font-medium">{d.title}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs text-destructive"
                      data-testid={`vehicle-doc-${d.id}-delete`}
                      disabled={del.isPending}
                      onClick={() => del.mutate(d.id)}
                    >
                      {ui.delete}
                    </Button>
                  </div>
                  {d.expiryDate && (
                    <p className={expiringSoon ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                      {formatBusinessDateShort(d.expiryDate)}
                    </p>
                  )}
                  {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                  {d.mediaId && <p className="text-xs text-muted-foreground italic">{ui.fileUploaded}</p>}
                </li>
              );
            })}
          </ul>
        )
      )}

      {showForm ? (
        <div className="grid gap-2.5 rounded-lg bg-muted/40 p-2.5">
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-doc-title">{ui.titleLabel}</Label>
            <Input
              id="vehicle-doc-title"
              data-testid="vehicle-doc-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldError) setFieldError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-doc-kind">{ui.kindLabel}</Label>
            <NativeSelect
              id="vehicle-doc-kind"
              data-testid="vehicle-doc-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as VehicleDocKind)}
            >
              {VEHICLE_DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ui.kindLabels[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-doc-expiry">{ui.expiryLabel}</Label>
            <Input
              id="vehicle-doc-expiry"
              type="date"
              data-testid="vehicle-doc-expiry"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-doc-note">{ui.noteLabel}</Label>
            <Textarea id="vehicle-doc-note" data-testid="vehicle-doc-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <PhotoField file={file} onChange={setFile} testId="vehicle-doc-file" label={ui.fileLabel} />
          {fieldError && (
            <p className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          )}
          {uploadNotice && (
            <Notice tone="warning" testId="vehicle-doc-upload-notice">
              {uploadNotice}
            </Notice>
          )}
          {serverError && (
            <Notice tone="error" testId="vehicle-doc-error">
              {serverError}
            </Notice>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="w-fit"
              data-testid="vehicle-doc-submit"
              disabled={create.isPending}
              onClick={() => {
                if (!title.trim()) {
                  setFieldError(ui.titleRequired);
                  return;
                }
                setUploadNotice(null);
                create.mutate();
              }}
            >
              {create.isPending ? ui.saving : ui.save}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setShowForm(false)}>
              {ui.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-fit" data-testid="vehicle-doc-add" onClick={() => setShowForm(true)}>
          {ui.addDoc}
        </Button>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// CW-12 — vehicle reminders (expiry / EMI / custom); SM + Owner only
// ---------------------------------------------------------------------------

function VehicleRemindersSection({ vehicleId }: { vehicleId: string }) {
  const m = useMessages();
  const locale = useLocale();
  const ui = VEHICLE_DOCS_UI[locale];
  const qc = useQueryClient();
  const remindersKey = ['vehicles', vehicleId, 'reminders'];

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ReminderKind>('CUSTOM');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>('ONCE');
  const [remindDaysBefore, setRemindDaysBefore] = useState('7');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const remindersQ = useQuery({
    queryKey: remindersKey,
    queryFn: () => api<VehicleReminder[]>('GET', `/vehicles/${vehicleId}/reminders`),
  });

  const create = useMutation({
    mutationFn: () => {
      const input: CreateVehicleReminderInput = {
        id: uuidv7(),
        vehicleId,
        label: label.trim(),
        kind,
        dueDate,
        recurrence,
        remindDaysBefore: Number(remindDaysBefore) || 7,
      };
      return api<VehicleReminder>('POST', `/vehicles/${vehicleId}/reminders`, input);
    },
    onSuccess: () => {
      setLabel('');
      setKind('CUSTOM');
      setDueDate('');
      setRecurrence('ONCE');
      setRemindDaysBefore('7');
      setShowForm(false);
      void qc.invalidateQueries({ queryKey: remindersKey });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => {
      const input: UpdateVehicleReminderInput = { active };
      return api<VehicleReminder>('PATCH', `/vehicle-reminders/${id}`, input);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: remindersKey }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/vehicle-reminders/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: remindersKey }),
  });

  const serverError =
    apiErrorOf(m, create.error);

  return (
    <Section title={ui.remindersTitle}>
      {remindersQ.isPending ? (
        <LoadingState />
      ) : remindersQ.error ? (
        <ErrorState error={remindersQ.error} onRetry={() => void remindersQ.refetch()} />
      ) : remindersQ.data && remindersQ.data.length === 0 && !showForm ? (
        <EmptyState label={ui.remindersEmpty} />
      ) : (
        remindersQ.data && (
          <ul className="divide-y" data-testid="vehicle-reminders">
            {remindersQ.data.map((r) => (
              <li key={r.id} className="grid gap-1 py-2.5 text-sm first:pt-0 last:pb-0" data-testid={`vehicle-reminder-${r.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                      {ui.reminderKindLabels[r.kind]}
                    </span>
                    <span className="min-w-0 truncate font-medium">{r.label}</span>
                    {!r.active && (
                      <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                        {ui.inactiveTag}
                      </span>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Checkbox
                      id={`vehicle-reminder-${r.id}-active`}
                      checked={r.active}
                      onCheckedChange={() => toggleActive.mutate({ id: r.id, active: !r.active })}
                      data-testid={`vehicle-reminder-${r.id}-active`}
                      aria-label={ui.activeLabel}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive"
                      data-testid={`vehicle-reminder-${r.id}-delete`}
                      disabled={del.isPending}
                      onClick={() => del.mutate(r.id)}
                    >
                      {ui.delete}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBusinessDateShort(r.dueDate)} · {ui.recurrenceLabels[r.recurrence]} · {ui.everyLabel} {r.remindDaysBefore}{' '}
                  {ui.daysBeforeSuffix}
                </p>
              </li>
            ))}
          </ul>
        )
      )}

      {showForm ? (
        <div className="grid gap-2.5 rounded-lg bg-muted/40 p-2.5">
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-reminder-label">{ui.labelLabel}</Label>
            <Input
              id="vehicle-reminder-label"
              data-testid="vehicle-reminder-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (fieldError) setFieldError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-reminder-kind">{ui.reminderKindLabel}</Label>
            <NativeSelect
              id="vehicle-reminder-kind"
              data-testid="vehicle-reminder-kind"
              value={kind}
              onChange={(e) => {
                const nextKind = e.target.value as ReminderKind;
                setKind(nextKind);
                if (nextKind === 'EMI') setRecurrence('MONTHLY'); // EMI: monthly recurrence prefilled
              }}
            >
              {REMINDER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ui.reminderKindLabels[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-reminder-due">{ui.dueDateLabel}</Label>
            <Input
              id="vehicle-reminder-due"
              type="date"
              data-testid="vehicle-reminder-due"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                if (fieldError) setFieldError(null);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-reminder-recurrence">{ui.recurrenceLabel}</Label>
            <NativeSelect
              id="vehicle-reminder-recurrence"
              data-testid="vehicle-reminder-recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
            >
              {REMINDER_RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {ui.recurrenceLabels[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vehicle-reminder-days">{ui.remindDaysLabel}</Label>
            <Input
              id="vehicle-reminder-days"
              type="number"
              min={0}
              max={365}
              data-testid="vehicle-reminder-days"
              value={remindDaysBefore}
              onChange={(e) => setRemindDaysBefore(e.target.value)}
            />
          </div>
          {fieldError && (
            <p className="text-sm text-destructive" role="alert">
              {fieldError}
            </p>
          )}
          {serverError && (
            <Notice tone="error" testId="vehicle-reminder-error">
              {serverError}
            </Notice>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="w-fit"
              data-testid="vehicle-reminder-submit"
              disabled={create.isPending}
              onClick={() => {
                if (!label.trim()) {
                  setFieldError(ui.labelRequired);
                  return;
                }
                if (!dueDate) {
                  setFieldError(ui.dueDateRequired);
                  return;
                }
                create.mutate();
              }}
            >
              {create.isPending ? ui.saving : ui.save}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setShowForm(false)}>
              {ui.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="w-fit" data-testid="vehicle-reminder-add" onClick={() => setShowForm(true)}>
            {ui.addReminder}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            data-testid="vehicle-reminder-add-emi"
            onClick={() => {
              setKind('EMI');
              setRecurrence('MONTHLY');
              setShowForm(true);
            }}
          >
            {ui.emiPreset}
          </Button>
        </div>
      )}
    </Section>
  );
}
