'use client';

/**
 * Material entry (CW-8, updated frozen.10 / SUP-4; SM-sweep: OWNER + SITE_MANAGER
 * added) — /supervisor/materials, and (as a sub-page) /site-manager/materials +
 * /owner/materials via materials-screen.tsx's "Material entry" section.
 *
 * BACKEND FACT (SM-sweep): `POST /records/material-txn` now accepts OWNER too —
 * "whatever the supervisor can file, SM and OWNER can file too" — on top of the
 * pre-existing SUPERVISOR/SITE_MANAGER (record.enter) and DRIVER (vehicleLog.enter,
 * data-only pick) paths. The backend stamps `enteredRole: <role>, finalized: true`
 * for every non-DRIVER role — all three roles this screen serves file the FINAL,
 * accountable record. Only material types with `config.supervisorLogs !== false`
 * are offered in the picker (types the SM/Owner marked driver-only-view or
 * otherwise excluded don't show here, for any of the three roles).
 *
 * Site: SUPERVISOR and SITE_MANAGER never see a picker — `GET /sites` is
 * server-scoped to their ONE site (SUP-2 / SM-sweep), shown as a fixed label.
 * OWNER is genuinely multi-site, so gets the real pickable `SitePicker`. Date
 * window is role-parameterized (`minEntryDate(role, …)`: SUPERVISOR today+
 * yesterday, SITE_MANAGER 7 days, OWNER unlimited) — mirrors the backend's
 * `RECORD_CREATE_BACKDATE_LIMIT_DAYS`. Picking the org's auto-provisioned
 * "Other" material (matched by name, case-insensitive) opens a REQUIRED remark
 * field describing what it is (`material_txns.remark`). "Recent entries" is a
 * lazy `LazyHistorySection` (collapsed by default).
 *
 * A later work order builds the DRIVER's data-only pick screen (matched
 * against these entries by the accountant) — this screen does not touch that.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type { CreateMaterialTxnInput, Material, MaterialTxn, MaterialTxnType, Site, UUID } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { addDays, backdateDaysFor, todayKolkata } from '@/lib/business-date';
import { apiErrorOf, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DateSelect } from '@/components/entry/date-select';
import { SitePicker } from '@/components/entry/site-picker';
import { LoadingState, EmptyState, ErrorState } from '@/components/entry/states';
import { FormStatus } from '@/components/entry/form-status';
import { useLazySection, LazyHistorySection } from '@/components/ui/lazy-history';

export type MaterialEntryRole = 'SUPERVISOR' | 'SITE_MANAGER' | 'OWNER';

const UI = {
  en: {
    title: 'Material entry',
    subtitle: 'Log today’s material IN / used — this is the final record for the site.',
    site: 'Site',
    noSites: 'No site assigned to you yet',
    materialLabel: 'Material',
    selectMaterial: 'Select a material',
    noMaterials: 'No material types are set up for supervisor entry yet — ask your Site Manager to add one.',
    typeLabel: 'Entry type',
    typeIn: 'IN (received)',
    typeConsume: 'Used / consumed',
    qtyLabel: 'Quantity',
    unitLabel: 'Unit',
    materialRequired: 'Pick a material',
    qtyInvalid: 'Enter a quantity greater than 0',
    remarkLabel: 'What is it?',
    remarkPlaceholder: 'Describe the material',
    remarkRequired: 'Say what this material is',
    submit: 'Save entry',
    saving: 'Saving…',
    saved: 'Material entry saved',
    recentTitle: 'Recent entries',
    recentEmpty: 'No entries in the last 7 days',
  },
  hi: {
    title: 'सामान की एंट्री',
    subtitle: 'आज का सामान आया / इस्तेमाल हुआ दर्ज करें — यही साइट का अंतिम रिकॉर्ड है।',
    site: 'साइट',
    noSites: 'आपको अभी कोई साइट नहीं सौंपी गई',
    materialLabel: 'सामान',
    selectMaterial: 'सामान चुनें',
    noMaterials: 'सुपरवाइज़र एंट्री के लिए अभी कोई सामान सेट नहीं है — अपने साइट मैनेजर से जुड़वाएँ।',
    typeLabel: 'एंट्री का प्रकार',
    typeIn: 'आया (IN)',
    typeConsume: 'इस्तेमाल हुआ',
    qtyLabel: 'मात्रा',
    unitLabel: 'इकाई',
    materialRequired: 'सामान चुनें',
    qtyInvalid: '0 से ज़्यादा मात्रा दर्ज करें',
    remarkLabel: 'यह क्या है?',
    remarkPlaceholder: 'सामान के बारे में बताएँ',
    remarkRequired: 'बताएँ कि यह सामान क्या है',
    submit: 'एंट्री सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'सामान की एंट्री सहेज ली गई',
    recentTitle: 'हाल की एंट्रियाँ',
    recentEmpty: 'पिछले 7 दिनों में कोई एंट्री नहीं',
  },
} as const;

type UiText = UiStrings<typeof UI>;

const isOtherMaterial = (mat: Material | undefined) => (mat?.name ?? '').trim().toLowerCase() === 'other';

export function MaterialEntryScreen({ role }: { role: MaterialEntryRole }) {
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();
  const today = todayKolkata();

  const [date, setDate] = useState(today);
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('GET', '/materials') });

  const sites = sitesQ.data ?? [];
  // SUPERVISOR/SITE_MANAGER: exactly one site (server-scoped) — no picker at all.
  // OWNER: genuinely multi-site — a real picker, defaulting to the first site.
  const singleSite = sites[0];
  const siteId: UUID | '' =
    role === 'OWNER' ? (pickedSiteId !== '' ? pickedSiteId : (singleSite?.id ?? '')) : (singleSite?.id ?? '');

  // Only offer types the SM/Owner marked for supervisor entry (default true when unconfigured) —
  // this is the SAME entry form/eligibility rule for all three roles.
  const eligibleMaterials = (materialsQ.data ?? []).filter((mat) => mat.config?.supervisorLogs !== false);

  return (
    <div className="grid gap-4" data-testid="material-entry-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {role === 'OWNER' ? (
            <SitePicker
              sites={sitesQ.data}
              isLoading={sitesQ.isPending}
              value={siteId}
              onChange={setPickedSiteId}
              error={sitesQ.error}
              onRetry={() => void sitesQ.refetch()}
            />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="material-entry-site">{ui.site}</Label>
              {sitesQ.isPending ? (
                <LoadingState />
              ) : sitesQ.error ? (
                <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
              ) : !singleSite ? (
                <EmptyState label={ui.noSites} />
              ) : (
                <p
                  id="material-entry-site"
                  data-testid="material-entry-site-fixed"
                  className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
                >
                  {singleSite.name} ({singleSite.code})
                </p>
              )}
            </div>
          )}

          <DateSelect id="material-entry-date" testId="material-entry-date" value={date} onChange={setDate} today={today} backdateDays={backdateDaysFor(role)} />

          {materialsQ.isPending ? (
            <LoadingState />
          ) : materialsQ.error ? (
            <ErrorState error={materialsQ.error} onRetry={() => void materialsQ.refetch()} />
          ) : (
            <MaterialEntryForm
              ui={ui}
              siteId={siteId}
              date={date}
              materials={eligibleMaterials}
              onSaved={() => void queryClient.invalidateQueries({ queryKey: ['records', 'material-txn'] })}
            />
          )}
        </CardContent>
      </Card>

      <RecentMaterialEntries ui={ui} siteId={siteId} today={today} materials={materialsQ.data ?? []} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry form
// ---------------------------------------------------------------------------

function MaterialEntryForm({
  ui,
  siteId,
  date,
  materials,
  onSaved,
}: {
  ui: UiText;
  siteId: UUID | '';
  date: string;
  materials: Material[];
  onSaved: () => void;
}) {
  const m = useMessages();
  const [materialId, setMaterialId] = useState<UUID | ''>('');
  const [type, setType] = useState<Extract<MaterialTxnType, 'IN' | 'CONSUME'>>('IN');
  const [qtyText, setQtyText] = useState('');
  const [remark, setRemark] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ material?: string; qty?: string; remark?: string }>({});
  const [saved, setSaved] = useState(false);

  const selectedMaterial = materials.find((mat) => mat.id === materialId);
  const otherPicked = isOtherMaterial(selectedMaterial);

  const create = useMutation({
    mutationFn: (input: CreateMaterialTxnInput) => api<MaterialTxn>('POST', '/records/material-txn', input),
    onSuccess: () => {
      setSaved(true);
      setMaterialId('');
      setQtyText('');
      setRemark('');
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const qty = Number(qtyText);
    const errs: { material?: string; qty?: string; remark?: string } = {};
    if (!materialId || !selectedMaterial) errs.material = ui.materialRequired;
    if (!(Number.isFinite(qty) && qty > 0)) errs.qty = ui.qtyInvalid;
    if (otherPicked && !remark.trim()) errs.remark = ui.remarkRequired;
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0 || !siteId || !selectedMaterial) return;

    create.mutate({
      id: uuidv7(),
      type,
      materialId: selectedMaterial.id,
      qty,
      uom: selectedMaterial.uom,
      siteId,
      businessDate: date,
      ...(remark.trim() ? { remark: remark.trim() } : {}),
    });
  };

  const serverError =
    apiErrorOf(m, create.error);

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="material-entry-no-materials">
          {ui.noMaterials}
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor="material-entry-material">{ui.materialLabel}</Label>
            <NativeSelect
              id="material-entry-material"
              data-testid="material-entry-material"
              value={materialId}
              onChange={(e) => {
                setMaterialId(e.target.value);
                setFieldErrors((f) => ({ ...f, remark: undefined }));
              }}
            >
              <option value="">{ui.selectMaterial}</option>
              {materials.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name} ({mat.uom})
                </option>
              ))}
            </NativeSelect>
            {fieldErrors.material && (
              <p className="text-sm text-destructive" role="alert">
                {fieldErrors.material}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{ui.typeLabel}</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={type === 'IN' ? 'default' : 'outline'}
                aria-pressed={type === 'IN'}
                data-testid="material-entry-type-in"
                onClick={() => setType('IN')}
              >
                {ui.typeIn}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={type === 'CONSUME' ? 'default' : 'outline'}
                aria-pressed={type === 'CONSUME'}
                data-testid="material-entry-type-consume"
                onClick={() => setType('CONSUME')}
              >
                {ui.typeConsume}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="grid gap-2">
              <Label htmlFor="material-entry-qty">{ui.qtyLabel}</Label>
              <Input
                id="material-entry-qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                data-testid="material-entry-qty"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
              />
            </div>
            <p className="pb-1.5 text-sm text-muted-foreground" data-testid="material-entry-uom">
              {selectedMaterial?.uom ?? '—'}
            </p>
          </div>
          {fieldErrors.qty && (
            <p className="text-sm text-destructive" role="alert">
              {fieldErrors.qty}
            </p>
          )}

          {otherPicked && (
            <div className="grid gap-2">
              <Label htmlFor="material-entry-remark">{ui.remarkLabel}</Label>
              <Textarea
                id="material-entry-remark"
                data-testid="material-entry-remark"
                placeholder={ui.remarkPlaceholder}
                value={remark}
                onChange={(e) => {
                  setRemark(e.target.value);
                  if (fieldErrors.remark) setFieldErrors((f) => ({ ...f, remark: undefined }));
                }}
              />
              {fieldErrors.remark && (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.remark}
                </p>
              )}
            </div>
          )}

                      <FormStatus error={serverError} saved={saved} savedLabel={ui.saved} testIdPrefix="material-entry" />

          <Button type="submit" data-testid="material-entry-submit" disabled={create.isPending || !siteId}>
            {create.isPending ? ui.saving : ui.submit}
          </Button>
        </>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Recent (last-7-days) list — lazy (SUP-4): collapsed until the user taps
// "Show history"; the query is gated on the same flag.
// ---------------------------------------------------------------------------

function RecentMaterialEntries({
  ui,
  siteId,
  today,
  materials,
}: {
  ui: UiText;
  siteId: UUID | '';
  today: string;
  materials: Material[];
}) {
  const { shown, show } = useLazySection();
  const recentWindow = { from: addDays(today, -7), to: today };
  const qs = siteId ? new URLSearchParams({ siteId, ...recentWindow }).toString() : '';
  const q = useQuery({
    queryKey: ['records', 'material-txn', siteId],
    queryFn: () => api<MaterialTxn[]>('GET', `/records/material-txn?${qs}`),
    enabled: shown && siteId !== '',
  });
  const materialName = (id: UUID) => materials.find((mat) => mat.id === id)?.name ?? id;

  return (
    <Card size="sm" data-testid="recent-material-entries">
      <CardContent>
        <LazyHistorySection
          title={ui.recentTitle}
          shown={shown}
          onFirstShow={show}
          onRefresh={() => void q.refetch()}
          refreshing={q.isFetching}
          testId="material-entry-history"
        >
          {q.isPending ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : !q.data || q.data.length === 0 ? (
            <EmptyState label={ui.recentEmpty} />
          ) : (
            <ul className="divide-y" data-testid="material-entry-history-list">
              {q.data.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {materialName(t.materialId)} · {t.type}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{t.businessDate}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {t.qty} {t.uom}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </LazyHistorySection>
      </CardContent>
    </Card>
  );
}
