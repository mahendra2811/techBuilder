'use client';

/**
 * Materials catalog manager (CW-8; SM-sweep restructure) — /site-manager/materials,
 * /owner/materials.
 *
 * The SM (or Owner) defines the org's 10-20 material TYPES once (e.g. cement,
 * sand, steel). Each type carries a `MaterialTypeConfig` (shared/src/config.ts)
 * that drives who may enter transactions for it downstream:
 *   - supervisorLogs: the SUPERVISOR's (also SM's/Owner's) entry is the FINAL,
 *     accountable record (backend stamps enteredRole=<role>, finalized=true).
 *   - driverPicks: a DRIVER may additionally submit a data-only PICK for this
 *     type (finalized=false) — matched against the final entry later by the
 *     accountant (a later work order builds that review screen).
 *   - driverViewOnly: drivers may see this type's numbers but never enter them.
 *
 * SM-sweep restructure: the landing view is now exactly three tappable section
 * cards (`useSubPage`, the same in-page list↔detail split fleet-screen.tsx
 * uses) — no inline list/form on the landing itself:
 *   (a) "Material types" — the pre-existing read + inline-edit list.
 *   (b) "Add material type" — the SAME types list, compact + read-only, shown
 *       above the create form (client: "will show the current material types
 *       available and the form to create a new material type").
 *   (c) "Material entry" — NEW for SM+Owner: the exact same IN/CONSUME entry
 *       form the SUPERVISOR uses (`material-entry-screen.tsx`'s `MaterialEntryScreen`,
 *       now role-aware and reused here directly rather than duplicated) —
 *       backend fact: `POST /records/material-txn` now accepts OWNER too
 *       ("whatever the supervisor can file, SM and OWNER can file too"). SM
 *       gets the auto single-site fixed label (no picker); OWNER gets a real
 *       site picker (he's genuinely multi-site) — both live INSIDE that form.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { UOMS, type CreateMaterialInput, type Material, type MaterialTypeConfig, type UpdateMaterialInput } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { apiErrorOf, type UiStrings } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SectionCard } from '@/components/ui/section-card';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { LoadingState, ErrorState, EmptyState, Notice } from '@/components/entry/states';
import { MaterialEntryScreen } from './material-entry-screen';

const UI = {
  en: {
    title: 'Materials catalog',
    subtitle: 'Define the material types your sites track — who logs each one is set here.',
    listTitle: 'Material types',
    listHint: 'See and edit the material types you track.',
    listEmpty: 'No material types yet — add the first one below.',
    addTitle: 'Add a material type',
    addHint: 'See the current list, then add a new material type.',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Cement',
    unitLabel: 'Unit',
    nameRequired: 'Name is required',
    add: 'Add material',
    adding: 'Adding…',
    added: 'Material added',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    cancel: 'Cancel',
    toggleSupervisorLogs: 'Supervisor logs it',
    toggleDriverPicks: 'Driver can pick it',
    toggleDriverViewOnly: 'Driver view-only',
    entryTitle: 'Material entry',
    entryHint: "Log today's material IN / used, the same way the supervisor does.",
  },
  hi: {
    title: 'सामान की सूची',
    subtitle: 'अपनी साइटों पर ट्रैक होने वाले सामान के प्रकार यहाँ तय करें — कौन भरेगा यह भी यहीं तय होता है।',
    listTitle: 'सामान के प्रकार',
    listHint: 'अपने सामान के प्रकार देखें और बदलें।',
    listEmpty: 'अभी कोई सामान नहीं जोड़ा गया — नीचे पहला जोड़ें।',
    addTitle: 'नया सामान जोड़ें',
    addHint: 'मौजूदा सूची देखें, फिर नया सामान जोड़ें।',
    nameLabel: 'नाम',
    namePlaceholder: 'जैसे: सीमेंट',
    unitLabel: 'इकाई',
    nameRequired: 'नाम ज़रूरी है',
    add: 'सामान जोड़ें',
    adding: 'जोड़ा जा रहा है…',
    added: 'सामान जुड़ गया',
    edit: 'बदलें',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'सहेज लिया',
    cancel: 'रद्द करें',
    toggleSupervisorLogs: 'सुपरवाइज़र भरता है',
    toggleDriverPicks: 'ड्राइवर चुन सकता है',
    toggleDriverViewOnly: 'ड्राइवर सिर्फ़ देखे',
    entryTitle: 'सामग्री एंट्री',
    entryHint: 'आज का सामान आया / इस्तेमाल हुआ दर्ज करें — जैसे सुपरवाइज़र करता है।',
  },
} as const;

type UiText = UiStrings<typeof UI>;

/** The three per-type toggles — locale-switched like everything else on the screen. */
const CONFIG_TOGGLE_UI_KEY = {
  supervisorLogs: 'toggleSupervisorLogs',
  driverPicks: 'toggleDriverPicks',
  driverViewOnly: 'toggleDriverViewOnly',
} as const satisfies Record<keyof MaterialTypeConfig, keyof UiText>;
const CONFIG_TOGGLE_KEYS: Array<keyof MaterialTypeConfig> = ['supervisorLogs', 'driverPicks', 'driverViewOnly'];

const DEFAULT_CONFIG: MaterialTypeConfig = { supervisorLogs: true, driverPicks: false, driverViewOnly: false };

type MaterialsRole = 'OWNER' | 'SITE_MANAGER';
type MaterialsSection = 'types' | 'add' | 'entry';

export function MaterialsScreen({ role }: { role: MaterialsRole }) {
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();
  const { current: section, open: openSection, close: closeSection } = useSubPage<MaterialsSection>();

  const materialsQ = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('GET', '/materials') });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['materials'] });

  if (section === 'types') {
    return (
      <div className="grid gap-4" data-testid="materials-screen">
        <SubPageHeader title={ui.listTitle} onBack={closeSection} />
        <MaterialTypesList ui={ui} materialsQ={materialsQ} invalidate={invalidate} />
      </div>
    );
  }

  if (section === 'add') {
    return (
      <div className="grid gap-4" data-testid="materials-screen">
        <SubPageHeader title={ui.addTitle} onBack={closeSection} />
        <CompactMaterialsList ui={ui} materialsQ={materialsQ} />
        <CreateMaterialForm ui={ui} onCreated={invalidate} />
      </div>
    );
  }

  if (section === 'entry') {
    return (
      <div className="grid gap-4" data-testid="materials-screen">
        <SubPageHeader title={ui.entryTitle} onBack={closeSection} />
        <MaterialEntryScreen role={role} />
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="materials-screen">
      <Card>
        <CardHeader>
          <CardTitle>{ui.title}</CardTitle>
          <CardDescription>{ui.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <SectionCard variant="row" title={ui.listTitle} subtitle={ui.listHint} testId="materials-open-types" onOpen={() => openSection('types')} />
          <SectionCard variant="row" title={ui.addTitle} subtitle={ui.addHint} testId="materials-open-add" onOpen={() => openSection('add')} />
          <SectionCard variant="row" title={ui.entryTitle} subtitle={ui.entryHint} testId="materials-open-entry" onOpen={() => openSection('entry')} />
        </CardContent>
      </Card>
    </div>
  );
}


// ---------------------------------------------------------------------------
// (a) Material types — read + inline edit (unchanged from before the restructure)
// ---------------------------------------------------------------------------

function MaterialTypesList({
  ui,
  materialsQ,
  invalidate,
}: {
  ui: UiText;
  materialsQ: ReturnType<typeof useQuery<Material[]>>;
  invalidate: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card data-testid="materials-list">
      <CardHeader>
        <CardTitle>{ui.listTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {materialsQ.isPending ? (
          <LoadingState />
        ) : materialsQ.error ? (
          <ErrorState error={materialsQ.error} onRetry={() => void materialsQ.refetch()} />
        ) : !materialsQ.data || materialsQ.data.length === 0 ? (
          <EmptyState label={ui.listEmpty} />
        ) : (
          <ul className="divide-y">
            {materialsQ.data.map((mat) =>
              editingId === mat.id ? (
                <li key={mat.id} className="py-3 first:pt-0 last:pb-0" data-testid={`material-row-${mat.id}`}>
                  <EditMaterialForm ui={ui} material={mat} onDone={() => setEditingId(null)} onSaved={invalidate} />
                </li>
              ) : (
                <li key={mat.id} className="py-3 first:pt-0 last:pb-0" data-testid={`material-row-${mat.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{mat.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{mat.uom}</p>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid={`material-row-${mat.id}-edit`}
                      onClick={() => setEditingId(mat.id)}
                    >
                      {ui.edit}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CONFIG_TOGGLE_KEYS.filter((k) => (mat.config ?? DEFAULT_CONFIG)[k]).map((k) => (
                      <span
                        key={k}
                        data-testid={`material-row-${mat.id}-badge-${k}`}
                        className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {ui[CONFIG_TOGGLE_UI_KEY[k]]}
                      </span>
                    ))}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (b) Add material type — the CURRENT types list, compact + read-only, shown
// above the create form (client: "will show the current material types
// available and the form to create a new material type").
// ---------------------------------------------------------------------------

function CompactMaterialsList({ ui, materialsQ }: { ui: UiText; materialsQ: ReturnType<typeof useQuery<Material[]>> }) {
  return (
    <Card size="sm" data-testid="materials-compact-list">
      <CardHeader>
        <CardTitle>{ui.listTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {materialsQ.isPending ? (
          <LoadingState />
        ) : materialsQ.error ? (
          <ErrorState error={materialsQ.error} onRetry={() => void materialsQ.refetch()} />
        ) : !materialsQ.data || materialsQ.data.length === 0 ? (
          <EmptyState label={ui.listEmpty} />
        ) : (
          <ul className="divide-y">
            {materialsQ.data.map((mat) => (
              <li
                key={mat.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                data-testid={`materials-compact-row-${mat.id}`}
              >
                <span className="truncate text-sm font-medium">{mat.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{mat.uom}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Toggle row shared by add + edit forms
// ---------------------------------------------------------------------------

function ConfigToggles({ ui, config, onChange }: { ui: UiText; config: MaterialTypeConfig; onChange: (next: MaterialTypeConfig) => void }) {
  return (
    <div className="grid gap-2">
      {CONFIG_TOGGLE_KEYS.map((key) => (
        <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-input px-2.5 py-1.5">
          <span className="min-w-0 flex-1 text-xs">{ui[CONFIG_TOGGLE_UI_KEY[key]]}</span>
          <Button
            type="button"
            size="xs"
            variant={config[key] ? 'default' : 'outline'}
            aria-pressed={config[key]}
            data-testid={`material-config-${key}`}
            onClick={() => onChange({ ...config, [key]: !config[key] })}
          >
            {config[key] ? 'ON' : 'OFF'}
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add a material type
// ---------------------------------------------------------------------------

function CreateMaterialForm({ ui, onCreated }: { ui: UiText; onCreated: () => void }) {
  const m = useMessages();
  const [name, setName] = useState('');
  const [uom, setUom] = useState<(typeof UOMS)[number]>(UOMS[0]);
  const [config, setConfig] = useState<MaterialTypeConfig>(DEFAULT_CONFIG);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateMaterialInput) => api<Material>('POST', '/materials', input),
    onSuccess: () => {
      setSaved(true);
      setName('');
      setConfig(DEFAULT_CONFIG);
      onCreated();
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) {
      setNameError(ui.nameRequired);
      return;
    }
    setNameError(null);
    create.mutate({ id: uuidv7(), name: name.trim(), uom, config });
  };

  const serverError =
    apiErrorOf(m, create.error);

  return (
    <Card data-testid="create-material">
      <CardHeader>
        <CardTitle>{ui.addTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="material-name">{ui.nameLabel}</Label>
            <Input
              id="material-name"
              data-testid="material-name"
              placeholder={ui.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {nameError && (
              <p className="text-sm text-destructive" role="alert">
                {nameError}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="material-uom">{ui.unitLabel}</Label>
            <NativeSelect
              id="material-uom"
              data-testid="material-uom"
              value={uom}
              onChange={(e) => setUom(e.target.value as (typeof UOMS)[number])}
            >
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </NativeSelect>
          </div>

          <ConfigToggles ui={ui} config={config} onChange={setConfig} />

          {serverError && (
            <Notice tone="error" testId="create-material-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-material-success">
              {ui.added}
            </Notice>
          )}

          <Button type="submit" data-testid="create-material-submit" disabled={create.isPending}>
            {create.isPending ? ui.adding : ui.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit an existing material type (rename + retoggle)
// ---------------------------------------------------------------------------

function EditMaterialForm({
  ui,
  material,
  onDone,
  onSaved,
}: {
  ui: UiText;
  material: Material;
  onDone: () => void;
  onSaved: () => void;
}) {
  const m = useMessages();
  const [name, setName] = useState(material.name);
  const [config, setConfig] = useState<MaterialTypeConfig>(material.config ?? DEFAULT_CONFIG);
  const [nameError, setNameError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (input: UpdateMaterialInput) => api<Material>('PATCH', `/materials/${material.id}`, input),
    onSuccess: () => {
      onSaved();
      onDone();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(ui.nameRequired);
      return;
    }
    setNameError(null);
    update.mutate({ name: name.trim(), config });
  };

  const serverError =
    apiErrorOf(m, update.error);

  return (
    <form className="grid gap-3 rounded-lg border border-input p-3" noValidate onSubmit={onSubmit} data-testid={`material-edit-${material.id}`}>
      <div className="grid gap-2">
        <Label htmlFor={`material-edit-name-${material.id}`}>{ui.nameLabel}</Label>
        <Input
          id={`material-edit-name-${material.id}`}
          data-testid={`material-edit-name-${material.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {nameError && (
          <p className="text-sm text-destructive" role="alert">
            {nameError}
          </p>
        )}
      </div>

      <ConfigToggles ui={ui} config={config} onChange={setConfig} />

      {serverError && (
        <Notice tone="error" testId={`material-edit-${material.id}-error`}>
          {serverError}
        </Notice>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" data-testid={`material-edit-${material.id}-save`} disabled={update.isPending}>
          {update.isPending ? ui.saving : ui.save}
        </Button>
        <Button type="button" size="sm" variant="outline" data-testid={`material-edit-${material.id}-cancel`} onClick={onDone}>
          {ui.cancel}
        </Button>
      </div>
    </form>
  );
}
