'use client';

/**
 * Site-Manager Settings (WO-8, restructured frozen.10 / SM-2) — /site-manager/settings.
 *
 * The Owner's /owner/settings screen is read-only (no org-config update
 * endpoint). This screen is narrower but DOES write: it edits the caller's
 * OWN site via `PATCH /sites/:id/config` (backend/src/sites: SitesService
 * .updateConfig), which lets an SM override:
 *   - expense limits (worker/driver request cap, Supervisor per-entry limit —
 *     NEVER the SM's own per-entry limit, which is "one level above" him and
 *     Owner-edited only; the backend rejects the field outright if present),
 *   - which of the 6 expense categories are enabled + their Hindi/English
 *     labels, PLUS (frozen.10, SM-2) SM-created SUBcategories under them,
 *   - which boxes show on the worker/driver expense-request form,
 *   - (frozen.10, SM-2/D12) a generic per-form field-configuration hub, and
 *   - the site's emergency-contact list (feeds the worker/driver ContactPanel).
 *
 * `sites.expense_form_config` / `sites.emergency_contacts` are wholesale JSON
 * replaces server-side (not deep-merged) — every save here always sends the
 * COMPLETE `expenseFormConfig` object built from current local state
 * (limits + categories + subcategories + fields + formsConfig ALL live inside
 * that one JSON blob), regardless of which sub-page the user is looking at
 * when they tap Save. Emergency contacts are a separate PATCH body.
 *
 * Restructure (role-page-map SM-2): the old single stacked page is now a
 * landing list of section cards → in-page sub-pages (`useSubPage` — URL never
 * changes, `SubPageHeader`'s back button returns to the landing), matching the
 * pattern used by complaints/fleet/people in this same round.
 *
 * GET /sites is already RBAC-scoped (WP-1: an SM only ever sees their own
 * assigned/managed site(s)) — this screen assumes the common case of exactly
 * one site and uses the first one returned; it does not offer a site picker.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import {
  EMERGENCY_CONTACT_KINDS,
  EXPENSE_CATEGORIES,
  type EmergencyContact,
  type EmergencyContactKind,
  type ExpenseCategory,
  type ExpenseCategoryConfig,
  type ExpenseSubcategoryConfig,
  type Site,
  type SiteExpenseFormConfig,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { LoadingState, ErrorState, EmptyState, Notice } from '@/components/entry/states';

type FieldsState = {
  billPhoto: boolean;
  extraPhotos: boolean;
  remark: boolean;
  voiceNote: boolean;
  vendor: boolean;
};

const DEFAULT_FIELDS: FieldsState = {
  billPhoto: true,
  extraPhotos: true,
  remark: true,
  voiceNote: true,
  vendor: true,
};

type ContactRow = EmergencyContact & { _localId: string };

/** Per-form field config (frozen.10 SM-2/D12) — the loose record shape from `SiteExpenseFormConfig.formsConfig`. */
type FormsConfigState = NonNullable<SiteExpenseFormConfig['formsConfig']>;

type SectionKey = 'limits' | 'categories' | 'fields' | 'forms' | 'contacts';

/** frozen.10 (SM-2/D12): hardcoded catalog of every form in the app. v1 is
 *  config-STORAGE + UI only here — no individual form screen reads
 *  `formsConfig` yet (that's a later pass per each form's own owner); the
 *  field list per form below is a reasonable starting set of "known optional
 *  fields" that a later pass can extend without any contracts change (the
 *  storage shape is a loose `Record<string, ...>` for exactly this reason). */
const FORM_CATALOG: Array<{
  key: string;
  labelEn: string;
  labelHi: string;
  fields: Array<{ key: string; labelEn: string; labelHi: string }>;
}> = [
  {
    key: 'expense',
    labelEn: 'Expense (direct entry)',
    labelHi: 'खर्च (सीधी एंट्री)',
    fields: [
      { key: 'billPhoto', labelEn: 'Bill photo', labelHi: 'बिल फ़ोटो' },
      { key: 'extraPhotos', labelEn: 'Extra photos', labelHi: 'अतिरिक्त फ़ोटो' },
      { key: 'remark', labelEn: 'Remark', labelHi: 'टिप्पणी' },
      { key: 'vendor', labelEn: 'Vendor', labelHi: 'दुकान' },
    ],
  },
  {
    key: 'expenseRequest',
    labelEn: 'Expense request (worker/driver)',
    labelHi: 'खर्च अनुरोध (मज़दूर/ड्राइवर)',
    fields: [
      { key: 'billPhoto', labelEn: 'Bill photo', labelHi: 'बिल फ़ोटो' },
      { key: 'extraPhotos', labelEn: 'Extra photos', labelHi: 'अतिरिक्त फ़ोटो' },
      { key: 'remark', labelEn: 'Remark', labelHi: 'टिप्पणी' },
      { key: 'voiceNote', labelEn: 'Voice note', labelHi: 'आवाज़ नोट' },
      { key: 'vendor', labelEn: 'Vendor', labelHi: 'दुकान' },
    ],
  },
  {
    key: 'fuel',
    labelEn: 'Fuel',
    labelHi: 'ईंधन',
    fields: [
      { key: 'receiptPhoto', labelEn: 'Receipt photo', labelHi: 'रसीद फ़ोटो' },
      { key: 'odometer', labelEn: 'Odometer reading', labelHi: 'ओडोमीटर रीडिंग' },
    ],
  },
  {
    key: 'damage',
    labelEn: 'Vehicle damage',
    labelHi: 'वाहन क्षति',
    fields: [
      { key: 'photos', labelEn: 'Photos', labelHi: 'फ़ोटो' },
      { key: 'note', labelEn: 'Note', labelHi: 'टिप्पणी' },
    ],
  },
  {
    key: 'progress',
    labelEn: 'Progress',
    labelHi: 'प्रगति',
    fields: [{ key: 'photo', labelEn: 'Photo', labelHi: 'फ़ोटो' }],
  },
  {
    key: 'materialEntry',
    labelEn: 'Material entry',
    labelHi: 'सामग्री एंट्री',
    fields: [
      { key: 'photo', labelEn: 'Photo', labelHi: 'फ़ोटो' },
      { key: 'remark', labelEn: 'Remark', labelHi: 'टिप्पणी' },
    ],
  },
  {
    key: 'complaint',
    labelEn: 'Complaint',
    labelHi: 'शिकायत',
    fields: [{ key: 'photos', labelEn: 'Photos', labelHi: 'फ़ोटो' }],
  },
  {
    key: 'vehicleSwitch',
    labelEn: 'Vehicle switch',
    labelHi: 'वाहन बदलाव',
    fields: [{ key: 'note', labelEn: 'Note', labelHi: 'टिप्पणी' }],
  },
];

const slugify = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/** Module-local, bilingual — everything below is NEW copy the shared catalog
 *  (`m.SM_SETTINGS_UI`) doesn't have yet; existing labels keep coming from
 *  `useMessages()` as before. */
const UI = {
  en: {
    landingTitle: 'Settings',
    landingSubtitle: "Your site's limits, categories, forms, and contacts.",
    sectionLimits: 'Limits',
    sectionLimitsHint: 'Direct-entry amounts for your team.',
    sectionCategories: 'Expense categories',
    sectionCategoriesHint: 'Categories, subcategories, and labels.',
    sectionFields: 'Request-form fields',
    sectionFieldsHint: 'Boxes shown on the worker/driver request form.',
    sectionForms: 'Form configuration',
    sectionFormsHint: 'Fine-tune fields across every form in the app.',
    sectionContacts: 'Emergency contacts',
    sectionContactsHint: 'Numbers shown to workers and drivers.',
    thLimitActiveHint:
      'The Supervisor books directly up to this amount; above it, his entry goes to the Accountant for approval.',
    subcategoriesTitle: 'Subcategories',
    subcategoriesSubtitle: 'Add finer categories under the 6 fixed ones.',
    subcategoryParentLabel: 'Parent category',
    subcategoryKeyLabel: 'Key (auto)',
    subcategoryHiLabel: 'Hindi label',
    subcategoryEnLabel: 'English label',
    subcategoryAdd: 'Add subcategory',
    subcategoryAdded: 'Subcategory added — save settings to keep it.',
    subcategoryLabelsRequired: 'Enter both a Hindi and an English label.',
    subcategoryKeyTaken: 'A subcategory with that English label already exists.',
    subcategoryOn: 'On',
    subcategoryOff: 'Off',
    subcategoriesEmpty: 'No subcategories yet.',
    formsHubSubtitle:
      'v1: field show/hide + required, per form. Individual form screens will start reading this in a later pass.',
    fieldShown: 'Shown',
    fieldHidden: 'Hidden',
    fieldRequired: 'Required',
    fieldOptional: 'Optional',
  },
  hi: {
    landingTitle: 'सेटिंग्स',
    landingSubtitle: 'आपकी साइट की सीमाएं, श्रेणियां, फ़ॉर्म और संपर्क।',
    sectionLimits: 'सीमाएं',
    sectionLimitsHint: 'आपकी टीम के लिए सीधी-एंट्री राशियां।',
    sectionCategories: 'खर्च श्रेणियां',
    sectionCategoriesHint: 'श्रेणियां, उप-श्रेणियां और लेबल।',
    sectionFields: 'अनुरोध-फ़ॉर्म फ़ील्ड',
    sectionFieldsHint: 'मज़दूर/ड्राइवर अनुरोध फ़ॉर्म में दिखने वाले बॉक्स।',
    sectionForms: 'फ़ॉर्म कॉन्फ़िगरेशन',
    sectionFormsHint: 'ऐप के हर फ़ॉर्म की फ़ील्ड को बेहतर बनाएं।',
    sectionContacts: 'आपातकालीन संपर्क',
    sectionContactsHint: 'मज़दूरों और ड्राइवरों को दिखने वाले नंबर।',
    thLimitActiveHint: 'सुपरवाइज़र इस राशि तक सीधे बुक करता है; इससे ऊपर उसकी एंट्री अकाउंटेंट के अप्रूवल के लिए जाती है।',
    subcategoriesTitle: 'उप-श्रेणियां',
    subcategoriesSubtitle: '6 तय श्रेणियों के नीचे बारीक उप-श्रेणियां जोड़ें।',
    subcategoryParentLabel: 'मुख्य श्रेणी',
    subcategoryKeyLabel: 'कुंजी (स्वचालित)',
    subcategoryHiLabel: 'हिंदी लेबल',
    subcategoryEnLabel: 'अंग्रेज़ी लेबल',
    subcategoryAdd: 'उप-श्रेणी जोड़ें',
    subcategoryAdded: 'उप-श्रेणी जोड़ी गई — रखने के लिए सेटिंग्स सहेजें।',
    subcategoryLabelsRequired: 'हिंदी और अंग्रेज़ी दोनों लेबल भरें।',
    subcategoryKeyTaken: 'इस अंग्रेज़ी लेबल की उप-श्रेणी पहले से मौजूद है।',
    subcategoryOn: 'चालू',
    subcategoryOff: 'बंद',
    subcategoriesEmpty: 'अभी तक कोई उप-श्रेणी नहीं है।',
    formsHubSubtitle: 'v1: फ़ील्ड दिखाना/छिपाना + ज़रूरी — हर फ़ॉर्म के लिए। इसे हर फ़ॉर्म स्क्रीन बाद में इस्तेमाल करेगी।',
    fieldShown: 'दिख रहा',
    fieldHidden: 'छिपा',
    fieldRequired: 'ज़रूरी',
    fieldOptional: 'वैकल्पिक',
  },
} as const;
// Widened (plain `string` fields): `UI[locale]` (locale: 'en' | 'hi') resolves to the
// UNION of both branches' literal-object types, which isn't assignable to either branch
// alone — components receiving it as a prop need this wider, non-literal shape (same
// pattern as people-screen.tsx's `IdCardUi`).
type SettingsUi = { [K in keyof (typeof UI)['en']]: string };

export function SmSettingsScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = UI[locale];
  const queryClient = useQueryClient();
  const { current: section, open: openSection, close: closeSection } = useSubPage<SectionKey>();

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });

  // SM scope: GET /sites already returns only his own site(s) — take the first.
  const mySite = sitesQ.data?.[0];
  const orgExpense = meQ.data?.org.config.expense;

  // ---- local editable state, hydrated once from the loaded site + org config ----
  // "Adjusting state when a prop changes" pattern (react.dev) instead of a
  // useEffect: setState called conditionally during render, guarded by a
  // "last hydrated site id" marker, so it runs exactly once per loaded site
  // and never causes the extra-render-then-flash a useEffect would.
  const [hydratedSiteId, setHydratedSiteId] = useState<string | null>(null);
  const [requestCapInput, setRequestCapInput] = useState(''); // '' = follow org default
  const [thLimitInput, setThLimitInput] = useState('');
  const [categories, setCategories] = useState<ExpenseCategoryConfig[]>([]);
  const [subcategories, setSubcategories] = useState<ExpenseSubcategoryConfig[]>([]);
  const [fields, setFields] = useState<FieldsState>(DEFAULT_FIELDS);
  const [formsConfig, setFormsConfig] = useState<FormsConfigState>({});
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [limitErrors, setLimitErrors] = useState<Record<string, string>>({});

  if (mySite && orgExpense && hydratedSiteId !== mySite.id) {
    setHydratedSiteId(mySite.id);
    const cfg = mySite.expenseFormConfig;
    setRequestCapInput(cfg?.requestCapPaise !== undefined ? String(cfg.requestCapPaise / 100) : '');
    setThLimitInput(cfg?.thDirectLimitPaise !== undefined ? String(cfg.thDirectLimitPaise / 100) : '');
    setCategories(
      EXPENSE_CATEGORIES.map((key) => {
        const fromOverride = cfg?.categories?.find((c) => c.key === key);
        const fromOrg = orgExpense.categories.find((c) => c.key === key);
        return fromOverride ?? fromOrg ?? { key, labelHi: key, labelEn: key, enabled: true };
      }),
    );
    setSubcategories(cfg?.subcategories ?? orgExpense.subcategories);
    setFields({
      billPhoto: cfg?.fields?.billPhoto ?? true,
      extraPhotos: cfg?.fields?.extraPhotos ?? true,
      remark: cfg?.fields?.remark ?? true,
      voiceNote: cfg?.fields?.voiceNote ?? true,
      vendor: cfg?.fields?.vendor ?? true,
    });
    setFormsConfig(cfg?.formsConfig ?? {});
    setContacts((mySite.emergencyContacts ?? []).map((c) => ({ ...c, _localId: uuidv7() })));
  }

  // Effective (SAVED) values — site override ?? org default — independent of unsaved drafts.
  const effectiveRequestCapPaise = mySite?.expenseFormConfig?.requestCapPaise ?? orgExpense?.requestCapPaise;
  const effectiveThLimitPaise = mySite?.expenseFormConfig?.thDirectLimitPaise ?? orgExpense?.thDirectLimitPaise;
  const effectiveSmLimitPaise = mySite?.expenseFormConfig?.smDirectLimitPaise ?? orgExpense?.smDirectLimitPaise;
  const requestCapIsOverride = mySite?.expenseFormConfig?.requestCapPaise !== undefined;
  const thLimitIsOverride = mySite?.expenseFormConfig?.thDirectLimitPaise !== undefined;

  // ---- expense config save (Limits + Categories/Subcategories + Request-form fields
  // + the forms-config hub all live in ONE `expenseFormConfig` JSON blob — one PATCH,
  // shared by every one of those sub-pages' Save buttons) ----
  const [expenseSaved, setExpenseSaved] = useState(false);
  const saveExpense = useMutation({
    mutationFn: (body: SiteExpenseFormConfig) =>
      api<Site>('PATCH', `/sites/${mySite!.id}/config`, { expenseFormConfig: body }),
    onSuccess: () => {
      setExpenseSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: () => setExpenseSaved(false),
  });

  const parseRupeesInput = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  const onSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseSaved(false);
    if (!mySite) return;

    const requestCapRupees = parseRupeesInput(requestCapInput);
    const thLimitRupees = parseRupeesInput(thLimitInput);
    const errs: Record<string, string> = {};
    if (Number.isNaN(requestCapRupees)) errs.requestCap = m.SM_SETTINGS_UI.limitInvalid;
    if (Number.isNaN(thLimitRupees)) errs.thLimit = m.SM_SETTINGS_UI.limitInvalid;
    if (categories.some((c) => !c.labelHi.trim() || !c.labelEn.trim())) errs.categories = m.SM_SETTINGS_UI.categoryLabelRequired;
    setLimitErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body: SiteExpenseFormConfig = {
      ...(requestCapRupees !== undefined ? { requestCapPaise: rupeesToPaise(requestCapRupees) } : {}),
      ...(thLimitRupees !== undefined ? { thDirectLimitPaise: rupeesToPaise(thLimitRupees) } : {}),
      categories,
      subcategories,
      fields,
      formsConfig,
      // smDirectLimitPaise intentionally NEVER included: it is "one level above"
      // the Site Manager and Owner-edited only — the backend rejects the whole
      // request with FORBIDDEN if this key is present at all in an SM's body.
    };
    saveExpense.mutate(body);
  };

  const updateCategory = (i: number, patch: Partial<ExpenseCategoryConfig>) => {
    setCategories((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const updateField = (key: keyof FieldsState, value: boolean) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const updateFormField = (formKey: string, fieldKey: string, patch: { visible?: boolean; required?: boolean }) => {
    setFormsConfig((prev) => {
      const existingForm = prev[formKey]?.fields ?? {};
      const existingField = existingForm[fieldKey] ?? {};
      return {
        ...prev,
        [formKey]: { fields: { ...existingForm, [fieldKey]: { ...existingField, ...patch } } },
      };
    });
  };

  // ---- emergency contacts save (separate PATCH body) ----
  const [contactsSaved, setContactsSaved] = useState(false);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const saveContacts = useMutation({
    mutationFn: (body: EmergencyContact[]) =>
      api<Site>('PATCH', `/sites/${mySite!.id}/config`, { emergencyContacts: body }),
    onSuccess: () => {
      setContactsSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: () => setContactsSaved(false),
  });

  const addContact = () => {
    setContacts((prev) => [...prev, { _localId: uuidv7(), kind: EMERGENCY_CONTACT_KINDS[0], label: '', phone: '' }]);
  };
  const removeContact = (i: number) => {
    setContacts((prev) => prev.filter((_, idx) => idx !== i));
  };
  const updateContact = (i: number, patch: Partial<EmergencyContact>) => {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const onSaveContacts = (e: React.FormEvent) => {
    e.preventDefault();
    setContactsSaved(false);
    const errs: Record<string, string> = {};
    contacts.forEach((c, i) => {
      if (!c.label.trim()) errs[`label-${i}`] = m.SM_SETTINGS_UI.contactLabelRequired;
      if (c.phone.trim().length < 3) errs[`phone-${i}`] = m.SM_SETTINGS_UI.contactPhoneRequired;
    });
    setContactErrors(errs);
    if (Object.keys(errs).length > 0) return;
    saveContacts.mutate(contacts.map((c) => ({ kind: c.kind, label: c.label.trim(), phone: c.phone.trim() })));
  };

  const expenseServerError =
    saveExpense.error instanceof ApiClientError
      ? apiErrorMessage(m, saveExpense.error.code)
      : saveExpense.error
        ? apiErrorMessage(m)
        : null;
  const contactsServerError =
    saveContacts.error instanceof ApiClientError
      ? apiErrorMessage(m, saveContacts.error.code)
      : saveContacts.error
        ? apiErrorMessage(m)
        : null;

  if (meQ.isPending || sitesQ.isPending) {
    return (
      <Card data-testid="sm-settings-screen">
        <CardContent>
          <LoadingState />
        </CardContent>
      </Card>
    );
  }
  if (meQ.error || sitesQ.error) {
    return (
      <Card data-testid="sm-settings-screen">
        <CardContent>
          <ErrorState error={meQ.error ?? sitesQ.error} onRetry={() => { void meQ.refetch(); void sitesQ.refetch(); }} />
        </CardContent>
      </Card>
    );
  }
  if (!mySite) {
    return (
      <Card data-testid="sm-settings-screen">
        <CardContent>
          <EmptyState label={m.SM_SETTINGS_UI.noSite} />
        </CardContent>
      </Card>
    );
  }

  if (!section) {
    return (
      <div className="grid gap-4" data-testid="sm-settings-screen">
        <Card>
          <CardHeader>
            <CardTitle>{ui.landingTitle}</CardTitle>
            <CardDescription>{ui.landingSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <SectionCard title={ui.sectionLimits} hint={ui.sectionLimitsHint} testId="sm-settings-open-limits" onClick={() => openSection('limits')} />
            <SectionCard title={ui.sectionCategories} hint={ui.sectionCategoriesHint} testId="sm-settings-open-categories" onClick={() => openSection('categories')} />
            <SectionCard title={ui.sectionFields} hint={ui.sectionFieldsHint} testId="sm-settings-open-fields" onClick={() => openSection('fields')} />
            <SectionCard title={ui.sectionForms} hint={ui.sectionFormsHint} testId="sm-settings-open-forms" onClick={() => openSection('forms')} />
            <SectionCard title={ui.sectionContacts} hint={ui.sectionContactsHint} testId="sm-settings-open-contacts" onClick={() => openSection('contacts')} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === 'limits') {
    return (
      <div className="grid gap-4" data-testid="sm-settings-screen">
        <SubPageHeader title={ui.sectionLimits} onBack={closeSection} />
        <form className="grid gap-4" noValidate onSubmit={onSaveExpense}>
          <Card data-testid="sm-settings-limits">
            <CardHeader>
              <CardTitle>{m.SM_SETTINGS_UI.limitsTitle}</CardTitle>
              <CardDescription>{m.SM_SETTINGS_UI.limitsSubtitle}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="sm-settings-request-cap">{m.SM_SETTINGS_UI.requestCapLabel}</Label>
                <Input
                  id="sm-settings-request-cap"
                  data-testid="sm-settings-request-cap"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder={orgExpense ? String(orgExpense.requestCapPaise / 100) : undefined}
                  value={requestCapInput}
                  onChange={(e) => setRequestCapInput(e.target.value)}
                />
                {limitErrors.requestCap && (
                  <p className="text-xs text-destructive" role="alert">
                    {limitErrors.requestCap}
                  </p>
                )}
                {effectiveRequestCapPaise !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {m.SM_SETTINGS_UI.effectivePrefix} {formatPaise(effectiveRequestCapPaise)} ·{' '}
                    {requestCapIsOverride ? m.SM_SETTINGS_UI.customHint : m.SM_SETTINGS_UI.defaultHint}
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="sm-settings-th-limit">{m.SM_SETTINGS_UI.thLimitLabel}</Label>
                <Input
                  id="sm-settings-th-limit"
                  data-testid="sm-settings-th-limit"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder={orgExpense ? String(orgExpense.thDirectLimitPaise / 100) : undefined}
                  value={thLimitInput}
                  onChange={(e) => setThLimitInput(e.target.value)}
                />
                {limitErrors.thLimit && (
                  <p className="text-xs text-destructive" role="alert">
                    {limitErrors.thLimit}
                  </p>
                )}
                {effectiveThLimitPaise !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {m.SM_SETTINGS_UI.effectivePrefix} {formatPaise(effectiveThLimitPaise)} ·{' '}
                    {thLimitIsOverride ? m.SM_SETTINGS_UI.customHint : m.SM_SETTINGS_UI.defaultHint}
                  </p>
                )}
                <p className="text-xs text-muted-foreground" data-testid="sm-settings-th-limit-active-hint">
                  {ui.thLimitActiveHint}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="sm-settings-sm-limit">{m.SM_SETTINGS_UI.smLimitLabel}</Label>
                <p id="sm-settings-sm-limit" className="text-sm font-medium" data-testid="sm-settings-sm-limit-value">
                  {effectiveSmLimitPaise !== undefined ? formatPaise(effectiveSmLimitPaise) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">{m.SM_SETTINGS_UI.smLimitReadOnlyNote}</p>
              </div>
            </CardContent>
          </Card>

          {expenseServerError && (
            <Notice tone="error" testId="sm-settings-expense-error">
              {expenseServerError}
            </Notice>
          )}
          {expenseSaved && (
            <Notice tone="success" testId="sm-settings-expense-saved">
              {m.SM_SETTINGS_UI.expenseSettingsSaved}
            </Notice>
          )}
          <Button type="submit" data-testid="sm-settings-save-expense" disabled={saveExpense.isPending}>
            {saveExpense.isPending ? m.SM_SETTINGS_UI.savingExpenseSettings : m.SM_SETTINGS_UI.saveExpenseSettings}
          </Button>
        </form>
      </div>
    );
  }

  if (section === 'categories') {
    return (
      <div className="grid gap-4" data-testid="sm-settings-screen">
        <SubPageHeader title={ui.sectionCategories} onBack={closeSection} />
        <form className="grid gap-4" noValidate onSubmit={onSaveExpense}>
          <Card data-testid="sm-settings-categories">
            <CardHeader>
              <CardTitle>{m.SM_SETTINGS_UI.categoriesTitle}</CardTitle>
              <CardDescription>{m.SM_SETTINGS_UI.categoriesSubtitle}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {categories.map((c, i) => (
                <div key={c.key} className="grid gap-2 rounded-lg border border-input p-3" data-testid={`sm-settings-category-${c.key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{m.EXPENSE_CATEGORY_LABELS[c.key]}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={c.enabled ? 'default' : 'outline'}
                      aria-pressed={c.enabled}
                      data-testid={`sm-settings-category-${c.key}-toggle`}
                      onClick={() => updateCategory(i, { enabled: !c.enabled })}
                    >
                      {c.enabled ? m.SM_SETTINGS_UI.categoryOn : m.SM_SETTINGS_UI.categoryOff}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`cat-hi-${c.key}`} className="text-xs font-normal text-muted-foreground">
                        {m.SM_SETTINGS_UI.categoryHiLabel}
                      </Label>
                      <Input
                        id={`cat-hi-${c.key}`}
                        value={c.labelHi}
                        onChange={(e) => updateCategory(i, { labelHi: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`cat-en-${c.key}`} className="text-xs font-normal text-muted-foreground">
                        {m.SM_SETTINGS_UI.categoryEnLabel}
                      </Label>
                      <Input
                        id={`cat-en-${c.key}`}
                        value={c.labelEn}
                        onChange={(e) => updateCategory(i, { labelEn: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {limitErrors.categories && (
                <p className="text-xs text-destructive" role="alert">
                  {limitErrors.categories}
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="sm-settings-subcategories">
            <CardHeader>
              <CardTitle>{ui.subcategoriesTitle}</CardTitle>
              <CardDescription>{ui.subcategoriesSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <SubcategoriesManager
                ui={ui}
                categoryLabels={m.EXPENSE_CATEGORY_LABELS}
                subcategories={subcategories}
                setSubcategories={setSubcategories}
              />
            </CardContent>
          </Card>

          {expenseServerError && (
            <Notice tone="error" testId="sm-settings-expense-error">
              {expenseServerError}
            </Notice>
          )}
          {expenseSaved && (
            <Notice tone="success" testId="sm-settings-expense-saved">
              {m.SM_SETTINGS_UI.expenseSettingsSaved}
            </Notice>
          )}
          <Button type="submit" data-testid="sm-settings-save-expense" disabled={saveExpense.isPending}>
            {saveExpense.isPending ? m.SM_SETTINGS_UI.savingExpenseSettings : m.SM_SETTINGS_UI.saveExpenseSettings}
          </Button>
        </form>
      </div>
    );
  }

  if (section === 'fields') {
    return (
      <div className="grid gap-4" data-testid="sm-settings-screen">
        <SubPageHeader title={ui.sectionFields} onBack={closeSection} />
        <form className="grid gap-4" noValidate onSubmit={onSaveExpense}>
          <Card data-testid="sm-settings-fields">
            <CardHeader>
              <CardTitle>{m.SM_SETTINGS_UI.fieldsTitle}</CardTitle>
              <CardDescription>{m.SM_SETTINGS_UI.fieldsSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(fields) as Array<keyof FieldsState>).map((key) => (
                  <li key={key} className="flex items-center justify-between gap-2 rounded-lg border border-input px-2.5 py-1.5">
                    <span className="min-w-0 truncate text-xs">{m.SM_SETTINGS_UI.fieldLabels[key]}</span>
                    <Button
                      type="button"
                      size="xs"
                      variant={fields[key] ? 'default' : 'outline'}
                      aria-pressed={fields[key]}
                      data-testid={`sm-settings-field-${key}`}
                      onClick={() => updateField(key, !fields[key])}
                    >
                      {fields[key] ? m.SM_SETTINGS_UI.fieldShown : m.SM_SETTINGS_UI.fieldHidden}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {expenseServerError && (
            <Notice tone="error" testId="sm-settings-expense-error">
              {expenseServerError}
            </Notice>
          )}
          {expenseSaved && (
            <Notice tone="success" testId="sm-settings-expense-saved">
              {m.SM_SETTINGS_UI.expenseSettingsSaved}
            </Notice>
          )}
          <Button type="submit" data-testid="sm-settings-save-expense" disabled={saveExpense.isPending}>
            {saveExpense.isPending ? m.SM_SETTINGS_UI.savingExpenseSettings : m.SM_SETTINGS_UI.saveExpenseSettings}
          </Button>
        </form>
      </div>
    );
  }

  if (section === 'forms') {
    return (
      <FormsConfigSection
        ui={ui}
        formsConfig={formsConfig}
        onUpdateField={updateFormField}
        onBack={closeSection}
        onSave={onSaveExpense}
        saving={saveExpense.isPending}
        saved={expenseSaved}
        serverError={expenseServerError}
      />
    );
  }

  // section === 'contacts'
  return (
    <div className="grid gap-4" data-testid="sm-settings-screen">
      <SubPageHeader title={ui.sectionContacts} onBack={closeSection} />
      <form className="grid gap-4" noValidate onSubmit={onSaveContacts}>
        <Card data-testid="sm-settings-contacts">
          <CardHeader>
            <CardTitle>{m.SM_SETTINGS_UI.contactsTitle}</CardTitle>
            <CardDescription>{m.SM_SETTINGS_UI.contactsSubtitle}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {contacts.length === 0 ? (
              <EmptyState label={m.SM_SETTINGS_UI.contactsEmpty} />
            ) : (
              contacts.map((c, i) => (
                <div
                  key={c._localId}
                  className="grid gap-2 rounded-lg border border-input p-3 sm:grid-cols-[1fr_1.5fr_1fr_auto] sm:items-end"
                  data-testid={`sm-settings-contact-${i}`}
                >
                  <div className="grid gap-1">
                    <Label htmlFor={`contact-kind-${c._localId}`} className="text-xs font-normal text-muted-foreground">
                      {m.SM_SETTINGS_UI.contactKindLabel}
                    </Label>
                    <NativeSelect
                      id={`contact-kind-${c._localId}`}
                      data-testid={`sm-settings-contact-${i}-kind`}
                      value={c.kind}
                      onChange={(e) => updateContact(i, { kind: e.target.value as EmergencyContactKind })}
                    >
                      {EMERGENCY_CONTACT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {m.CONTACTS_UI.KIND_LABELS[k]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`contact-label-${c._localId}`} className="text-xs font-normal text-muted-foreground">
                      {m.SM_SETTINGS_UI.contactLabelLabel}
                    </Label>
                    <Input
                      id={`contact-label-${c._localId}`}
                      data-testid={`sm-settings-contact-${i}-label`}
                      value={c.label}
                      onChange={(e) => updateContact(i, { label: e.target.value })}
                    />
                    {contactErrors[`label-${i}`] && (
                      <p className="text-xs text-destructive" role="alert">
                        {contactErrors[`label-${i}`]}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`contact-phone-${c._localId}`} className="text-xs font-normal text-muted-foreground">
                      {m.SM_SETTINGS_UI.contactPhoneLabel}
                    </Label>
                    <Input
                      id={`contact-phone-${c._localId}`}
                      data-testid={`sm-settings-contact-${i}-phone`}
                      type="tel"
                      value={c.phone}
                      onChange={(e) => updateContact(i, { phone: e.target.value })}
                    />
                    {contactErrors[`phone-${i}`] && (
                      <p className="text-xs text-destructive" role="alert">
                        {contactErrors[`phone-${i}`]}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    data-testid={`sm-settings-contact-${i}-remove`}
                    onClick={() => removeContact(i)}
                  >
                    {m.SM_SETTINGS_UI.removeContact}
                  </Button>
                </div>
              ))
            )}
            <Button type="button" variant="outline" size="sm" data-testid="sm-settings-add-contact" onClick={addContact}>
              {m.SM_SETTINGS_UI.addContact}
            </Button>
          </CardContent>
        </Card>

        {contactsServerError && (
          <Notice tone="error" testId="sm-settings-contacts-error">
            {contactsServerError}
          </Notice>
        )}
        {contactsSaved && (
          <Notice tone="success" testId="sm-settings-contacts-saved">
            {m.SM_SETTINGS_UI.contactsSaved}
          </Notice>
        )}
        <Button type="submit" data-testid="sm-settings-save-contacts" disabled={saveContacts.isPending}>
          {saveContacts.isPending ? m.SM_SETTINGS_UI.savingContacts : m.SM_SETTINGS_UI.saveContacts}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing section card
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  hint,
  testId,
  onClick,
}: {
  title: string;
  hint: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-input px-3.5 py-3 text-left hover:bg-accent"
      data-testid={testId}
      onClick={onClick}
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Subcategory manager (frozen.10, SM-2) — lives inside the Categories sub-page
// ---------------------------------------------------------------------------

function SubcategoriesManager({
  ui,
  categoryLabels,
  subcategories,
  setSubcategories,
}: {
  ui: SettingsUi;
  categoryLabels: Record<ExpenseCategory, string>;
  subcategories: ExpenseSubcategoryConfig[];
  setSubcategories: React.Dispatch<React.SetStateAction<ExpenseSubcategoryConfig[]>>;
}) {
  const [parent, setParent] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0]);
  const [labelEn, setLabelEn] = useState('');
  const [labelHi, setLabelHi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const preview = slugify(labelEn);

  const toggleSubcategory = (key: string) => {
    setSubcategories((prev) => prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)));
  };

  const addSubcategory = () => {
    setAdded(false);
    if (!labelEn.trim() || !labelHi.trim()) {
      setError(ui.subcategoryLabelsRequired);
      return;
    }
    const key = slugify(labelEn) || `sub_${subcategories.length + 1}`;
    if (subcategories.some((s) => s.key === key)) {
      setError(ui.subcategoryKeyTaken);
      return;
    }
    setError(null);
    setSubcategories((prev) => [...prev, { key, parent, labelEn: labelEn.trim(), labelHi: labelHi.trim(), enabled: true }]);
    setLabelEn('');
    setLabelHi('');
    setAdded(true);
  };

  return (
    <div className="grid gap-3">
      {subcategories.length === 0 ? (
        <EmptyState label={ui.subcategoriesEmpty} />
      ) : (
        <ul className="grid gap-2">
          {subcategories.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-input p-2.5"
              data-testid={`sm-settings-subcategory-${s.key}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.labelEn} <span className="font-normal text-muted-foreground">/ {s.labelHi}</span>
                </p>
                <p className="text-xs text-muted-foreground">{categoryLabels[s.parent]}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={s.enabled ? 'default' : 'outline'}
                aria-pressed={s.enabled}
                data-testid={`sm-settings-subcategory-${s.key}-toggle`}
                onClick={() => toggleSubcategory(s.key)}
              >
                {s.enabled ? ui.subcategoryOn : ui.subcategoryOff}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 rounded-lg border border-dashed border-input p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="sm-settings-subcategory-parent" className="text-xs font-normal text-muted-foreground">
              {ui.subcategoryParentLabel}
            </Label>
            <NativeSelect
              id="sm-settings-subcategory-parent"
              data-testid="sm-settings-subcategory-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {categoryLabels[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sm-settings-subcategory-key" className="text-xs font-normal text-muted-foreground">
              {ui.subcategoryKeyLabel}
            </Label>
            <Input id="sm-settings-subcategory-key" data-testid="sm-settings-subcategory-key" value={preview} disabled readOnly />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="sm-settings-subcategory-en" className="text-xs font-normal text-muted-foreground">
              {ui.subcategoryEnLabel}
            </Label>
            <Input
              id="sm-settings-subcategory-en"
              data-testid="sm-settings-subcategory-en"
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sm-settings-subcategory-hi" className="text-xs font-normal text-muted-foreground">
              {ui.subcategoryHiLabel}
            </Label>
            <Input
              id="sm-settings-subcategory-hi"
              data-testid="sm-settings-subcategory-hi"
              value={labelHi}
              onChange={(e) => setLabelHi(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {added && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400" data-testid="sm-settings-subcategory-added">
            {ui.subcategoryAdded}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          data-testid="sm-settings-subcategory-add"
          onClick={addSubcategory}
        >
          {ui.subcategoryAdd}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form-configuration hub (frozen.10, SM-2/D12) — landing (list of forms) →
// per-form field-toggle sub-page (nested `useSubPage`).
// ---------------------------------------------------------------------------

function FormsConfigSection({
  ui,
  formsConfig,
  onUpdateField,
  onBack,
  onSave,
  saving,
  saved,
  serverError,
}: {
  ui: SettingsUi;
  formsConfig: FormsConfigState;
  onUpdateField: (formKey: string, fieldKey: string, patch: { visible?: boolean; required?: boolean }) => void;
  onBack: () => void;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
  saved: boolean;
  serverError: string | null;
}) {
  const locale = useLocale();
  const m = useMessages();
  const { current: formKey, open: openForm, close: closeForm } = useSubPage<string>();

  if (formKey) {
    const catalog = FORM_CATALOG.find((f) => f.key === formKey);
    if (!catalog) return null;
    const fieldsCfg = formsConfig[formKey]?.fields ?? {};
    return (
      <div className="grid gap-4" data-testid="sm-settings-screen">
        <SubPageHeader title={locale === 'hi' ? catalog.labelHi : catalog.labelEn} onBack={closeForm} />
        <form className="grid gap-4" noValidate onSubmit={onSave}>
          <Card data-testid={`sm-settings-form-${catalog.key}`}>
            <CardContent className="grid gap-3">
              {catalog.fields.map((f) => {
                const visible = fieldsCfg[f.key]?.visible ?? true;
                const required = fieldsCfg[f.key]?.required ?? false;
                return (
                  <div
                    key={f.key}
                    className="grid gap-2 rounded-lg border border-input p-3 sm:flex sm:items-center sm:justify-between"
                    data-testid={`sm-settings-form-${catalog.key}-field-${f.key}`}
                  >
                    <span className="text-sm font-medium">{locale === 'hi' ? f.labelHi : f.labelEn}</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={visible ? 'default' : 'outline'}
                        aria-pressed={visible}
                        data-testid={`sm-settings-form-${catalog.key}-field-${f.key}-visible`}
                        onClick={() => onUpdateField(catalog.key, f.key, { visible: !visible })}
                      >
                        {visible ? ui.fieldShown : ui.fieldHidden}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={required ? 'default' : 'outline'}
                        aria-pressed={required}
                        data-testid={`sm-settings-form-${catalog.key}-field-${f.key}-required`}
                        onClick={() => onUpdateField(catalog.key, f.key, { required: !required })}
                      >
                        {required ? ui.fieldRequired : ui.fieldOptional}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {serverError && (
            <Notice tone="error" testId="sm-settings-expense-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="sm-settings-expense-saved">
              {m.SM_SETTINGS_UI.expenseSettingsSaved}
            </Notice>
          )}
          <Button type="submit" data-testid="sm-settings-save-expense" disabled={saving}>
            {saving ? m.SM_SETTINGS_UI.savingExpenseSettings : m.SM_SETTINGS_UI.saveExpenseSettings}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="sm-settings-screen">
      <SubPageHeader title={ui.sectionForms} onBack={onBack} />
      <Card>
        <CardHeader>
          <CardDescription>{ui.formsHubSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {FORM_CATALOG.map((f) => (
            <SectionCard
              key={f.key}
              title={locale === 'hi' ? f.labelHi : f.labelEn}
              hint={`${f.fields.length}`}
              testId={`sm-settings-form-open-${f.key}`}
              onClick={() => openForm(f.key)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
