'use client';

/**
 * SUPERVISOR material entry (CW-8, updated frozen.10 / SUP-4) — /supervisor/materials.
 *
 * The Supervisor's entry is the FINAL, accountable material record — the
 * backend stamps `enteredRole: 'SUPERVISOR', finalized: true` on every txn
 * this screen submits (RecordsService.createMaterialTxn). Only material types
 * with `config.supervisorLogs !== false` are offered in the picker (types the
 * SM/Owner marked driver-only-view or otherwise excluded don't show here).
 *
 * frozen.10 (SUP-4): no site picker — `GET /sites` is server-scoped to the
 * supervisor's ONE site (SUP-2), shown as a fixed label. Date is limited to
 * today + yesterday (`minEntryDate('SUPERVISOR', …)`). Picking the org's
 * auto-provisioned "Other" material (matched by name, case-insensitive) opens
 * a REQUIRED remark field describing what it is (`material_txns.remark`).
 * "Recent entries" is now a lazy `LazyHistorySection` (collapsed by default).
 *
 * A later work order builds the DRIVER's data-only pick screen (matched
 * against these entries by the accountant) — this screen does not touch that.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type { CreateMaterialTxnInput, Material, MaterialTxn, MaterialTxnType, Site, UUID } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, minEntryDate, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';
import { useLazySection, LazyHistorySection } from '@/components/ui/lazy-history';

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

// Widened to plain `string` per key (not the literal `en` type) — `UI[locale]` is a union of
// the `en`/`hi` literal-string objects, and only the widened form is assignable from both.
type UiText = Record<keyof (typeof UI)['en'], string>;

const isOtherMaterial = (mat: Material | undefined) => (mat?.name ?? '').trim().toLowerCase() === 'other';

export function MaterialEntryScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();
  const today = todayKolkata();
  const minDate = minEntryDate('SUPERVISOR', today);

  const [date, setDate] = useState(today);

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('GET', '/materials') });

  const sites = sitesQ.data ?? [];
  const site = sites[0]; // frozen.10 (SUP-2): supervisor has exactly one site — no picker.
  const siteId: UUID | '' = site?.id ?? '';

  // Only offer types the SM/Owner marked for supervisor entry (default true when unconfigured).
  const eligibleMaterials = (materialsQ.data ?? []).filter((mat) => mat.config?.supervisorLogs !== false);

  return (
    <div className="grid gap-4" data-testid="material-entry-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="material-entry-site">{ui.site}</Label>
            {sitesQ.isPending ? (
              <LoadingState />
            ) : sitesQ.error ? (
              <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
            ) : !site ? (
              <EmptyState label={ui.noSites} />
            ) : (
              <p
                id="material-entry-site"
                data-testid="material-entry-site-fixed"
                className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
              >
                {site.name} ({site.code})
              </p>
            )}
          </div>

          <DateField id="material-entry-date" testId="material-entry-date" value={date} onChange={setDate} min={minDate} max={today} />

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
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

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

          {serverError && (
            <Notice tone="error" testId="material-entry-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="material-entry-saved">
              {ui.saved}
            </Notice>
          )}

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
