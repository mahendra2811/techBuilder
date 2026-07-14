'use client';

/**
 * SUPERVISOR material entry (CW-8) — /supervisor/materials.
 *
 * The Supervisor's entry is the FINAL, accountable material record — the
 * backend stamps `enteredRole: 'SUPERVISOR', finalized: true` on every txn
 * this screen submits (RecordsService.createMaterialTxn). Only material types
 * with `config.supervisorLogs !== false` are offered in the picker (types the
 * SM/Owner marked driver-only-view or otherwise excluded don't show here).
 *
 * A later work order builds the DRIVER's data-only pick screen (matched
 * against these entries by the accountant) — this screen does not touch that.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type { CreateMaterialTxnInput, Material, MaterialTxn, MaterialTxnType, Site, UUID } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { DateField } from '@/components/entry/date-field';
import { SitePicker } from '@/components/entry/site-picker';
import { RecentEntries } from '@/components/entry/recent-entries';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';

const UI = {
  en: {
    title: 'Material entry',
    subtitle: 'Log today’s material IN / used — this is the final record for the site.',
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
    submit: 'Save entry',
    saving: 'Saving…',
    saved: 'Material entry saved',
    recentTitle: 'Recent entries',
  },
  hi: {
    title: 'सामान की एंट्री',
    subtitle: 'आज का सामान आया / इस्तेमाल हुआ दर्ज करें — यही साइट का अंतिम रिकॉर्ड है।',
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
    submit: 'एंट्री सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'सामान की एंट्री सहेज ली गई',
    recentTitle: 'हाल की एंट्रियाँ',
  },
} as const;

// Widened to plain `string` per key (not the literal `en` type) — `UI[locale]` is a union of
// the `en`/`hi` literal-string objects, and only the widened form is assignable from both.
type UiText = Record<keyof (typeof UI)['en'], string>;

export function MaterialEntryScreen() {
  const locale = useLocale();
  const ui = UI[locale];
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');
  const [date, setDate] = useState(today);

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('GET', '/materials') });

  const sites = sitesQ.data;
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');

  // Only offer types the SM/Owner marked for supervisor entry (default true when unconfigured).
  const eligibleMaterials = (materialsQ.data ?? []).filter((mat) => mat.config?.supervisorLogs !== false);

  const recentWindow = { from: addDays(today, -7), to: today };
  const recentQs = siteId ? new URLSearchParams({ siteId, from: recentWindow.from, to: recentWindow.to }).toString() : '';

  return (
    <div className="grid gap-4" data-testid="material-entry-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SitePicker
            sites={sites}
            isLoading={sitesQ.isPending}
            value={siteId}
            onChange={setPickedSiteId}
            error={sitesQ.error}
            onRetry={() => void sitesQ.refetch()}
          />
          <DateField id="material-entry-date" testId="material-entry-date" value={date} onChange={setDate} max={today} />

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

      <RecentMaterialEntries ui={ui} siteId={siteId} qs={recentQs} materials={materialsQ.data ?? []} />
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
  const [fieldErrors, setFieldErrors] = useState<{ material?: string; qty?: string }>({});
  const [saved, setSaved] = useState(false);

  const selectedMaterial = materials.find((mat) => mat.id === materialId);

  const create = useMutation({
    mutationFn: (input: CreateMaterialTxnInput) => api<MaterialTxn>('POST', '/records/material-txn', input),
    onSuccess: () => {
      setSaved(true);
      setMaterialId('');
      setQtyText('');
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    const qty = Number(qtyText);
    const errs: { material?: string; qty?: string } = {};
    if (!materialId || !selectedMaterial) errs.material = ui.materialRequired;
    if (!(Number.isFinite(qty) && qty > 0)) errs.qty = ui.qtyInvalid;
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
              onChange={(e) => setMaterialId(e.target.value)}
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
// Recent (last-7-days) list
// ---------------------------------------------------------------------------

function RecentMaterialEntries({
  ui,
  siteId,
  qs,
  materials,
}: {
  ui: UiText;
  siteId: UUID | '';
  qs: string;
  materials: Material[];
}) {
  const q = useQuery({
    queryKey: ['records', 'material-txn', siteId],
    queryFn: () => api<MaterialTxn[]>('GET', `/records/material-txn?${qs}`),
    enabled: siteId !== '',
  });
  const materialName = (id: UUID) => materials.find((mat) => mat.id === id)?.name ?? id;

  return (
    <RecentEntries
      testId="recent-material-entries"
      isLoading={siteId !== '' && q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      rows={q.data?.map((t) => ({
        id: t.id,
        primary: `${materialName(t.materialId)} · ${t.type}`,
        secondary: `${t.qty} ${t.uom}`,
        tertiary: t.businessDate,
      }))}
    />
  );
}
