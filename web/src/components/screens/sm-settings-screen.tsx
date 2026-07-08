'use client';

/**
 * Site-Manager Settings (WO-8) — /site-manager/settings.
 *
 * The Owner's /owner/settings screen is read-only (no org-config update
 * endpoint). This screen is narrower but DOES write: it edits the caller's
 * OWN site via `PATCH /sites/:id/config` (backend/src/sites: SitesService
 * .updateConfig), which lets an SM override:
 *   - expense limits (worker/driver request cap, Team-Head per-entry limit —
 *     NEVER the SM's own per-entry limit, which is "one level above" him and
 *     Owner-edited only; the backend rejects the field outright if present),
 *   - which of the 6 expense categories are enabled + their Hindi/English
 *     labels,
 *   - which boxes show on the worker/driver expense-request form, and
 *   - the site's emergency-contact list (feeds the worker/driver ContactPanel).
 *
 * `sites.expense_form_config` / `sites.emergency_contacts` are wholesale
 * JSON replaces server-side (not deep-merged) — every save here always sends
 * the COMPLETE object built from current local state, per the backend
 * contract.
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
  type ExpenseCategoryConfig,
  type Site,
  type SiteExpenseFormConfig,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
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

export function SmSettingsScreen() {
  const m = useMessages();
  const queryClient = useQueryClient();

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
  const [fields, setFields] = useState<FieldsState>(DEFAULT_FIELDS);
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
    setFields({
      billPhoto: cfg?.fields?.billPhoto ?? true,
      extraPhotos: cfg?.fields?.extraPhotos ?? true,
      remark: cfg?.fields?.remark ?? true,
      voiceNote: cfg?.fields?.voiceNote ?? true,
      vendor: cfg?.fields?.vendor ?? true,
    });
    setContacts((mySite.emergencyContacts ?? []).map((c) => ({ ...c, _localId: uuidv7() })));
  }

  // Effective (SAVED) values — site override ?? org default — independent of unsaved drafts.
  const effectiveRequestCapPaise = mySite?.expenseFormConfig?.requestCapPaise ?? orgExpense?.requestCapPaise;
  const effectiveThLimitPaise = mySite?.expenseFormConfig?.thDirectLimitPaise ?? orgExpense?.thDirectLimitPaise;
  const effectiveSmLimitPaise = mySite?.expenseFormConfig?.smDirectLimitPaise ?? orgExpense?.smDirectLimitPaise;
  const requestCapIsOverride = mySite?.expenseFormConfig?.requestCapPaise !== undefined;
  const thLimitIsOverride = mySite?.expenseFormConfig?.thDirectLimitPaise !== undefined;

  // ---- expense config save (Limits + Categories + Request-form fields — one JSON blob) ----
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
      fields,
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

  // ---- emergency contacts save ----
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

  return (
    <div className="grid gap-4" data-testid="sm-settings-screen">
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

      <Separator />

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
