'use client';

/**
 * Direct-expense screen (SM + TH — one component, two thin page wrappers).
 * This is the "Expense" half of the old combined Records screen, now with
 * LIMIT-AWARE ROUTING: an entry at or under the caller's per-entry limit is
 * booked instantly (POST /records/expense); an entry over the limit is
 * submitted as an EXPENSE_ADD approval request instead (POST /requests), the
 * same way a worker/driver's expense request works — the next role up
 * approves it before it becomes a booked expense.
 *
 * Money is entered in RUPEES and sent as INTEGER PAISE. Photos/voice are
 * best-effort: a failed upload never blocks the entry (non-blocking notice).
 *
 * DTO note: the direct `CreateExpenseInput` (frozen contracts) only carries a
 * single `receiptMediaId` — it has no slot for extra photos, a remark, or a
 * voice note. Those three fields ARE sent when the entry goes through the
 * approval-request path (`ExpenseRequestPayload.remark` / `.mediaIds`), but on
 * a direct (under-limit) booking they are best-effort uploaded (kept in the
 * media table under the expense's parentId for traceability) — remark has no
 * DTO field at all on `CreateExpenseInput`, so it is silently NOT persisted on
 * the direct path (documented assumption; see the WO-6 report).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  type ApprovalRequest,
  type BusinessDate,
  type CreateExpenseInput,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryConfig,
  type ExpenseRequestPayload,
  type ExpenseSubcategoryConfig,
  type PaymentMode,
  type Site,
  type SubmitRequestInput,
  type User,
  type UUID,
  type Vendor,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, backdateDaysFor, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { apiErrorOf } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DateSelect } from '@/components/entry/date-select';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { RecentEntries } from '@/components/entry/recent-entries';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

// SUP-9 (2026-07-19): the SUPERVISOR was removed as a direct-entry role — supervisors submit
// EXPENSE_ADD requests (ExpenseRequestScreen on /supervisor/expense), and the backend forbids a
// supervisor direct booking. This direct-entry screen now serves the SITE_MANAGER only.
type EntryRole = 'SITE_MANAGER';
const MAX_BILL_PHOTOS = 1;
const MAX_EXTRA_PHOTOS = 2;
/** MISC is the "Other" category — its remark becomes required+emphasized (frozen.10 SUP-9). */
const OTHER_CATEGORY: ExpenseCategory = 'MISC';

// Module-local additions on top of the frozen EXPENSE_UI/VENDOR_UI catalogs (frozen.10).
const LOCAL_UI = {
  en: {
    site: 'Site',
    noSites: 'No site assigned to you yet',
    subcategoryLabel: 'Type',
    remarkRequiredLabel: 'Remark (required)',
    remarkRequiredError: 'Say what this expense is',
  },
  hi: {
    site: 'साइट',
    noSites: 'आपको अभी कोई साइट नहीं सौंपी गई',
    subcategoryLabel: 'प्रकार',
    remarkRequiredLabel: 'टिप्पणी (ज़रूरी)',
    remarkRequiredError: 'बताएँ कि यह ख़र्च किस बारे में है',
  },
} as const;

export function ExpenseScreen({ role }: { role: EntryRole }) {
  const m = useMessages();
  const locale = useLocale();
  const local = LOCAL_UI[locale];
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const [date, setDate] = useState<BusinessDate>(today);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  // Scoped to the caller's site/crew (view.all) — resolves "who entered" in the history list.
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  // WO-10: udhaar-khata shops for the "paid by cash / on credit" selector.
  const vendorsQ = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('GET', '/vendors') });
  const userName = (id: UUID) => usersQ.data?.find((u) => u.id === id)?.name ?? m.EXPENSE_UI.unknownUser;

  const sites = sitesQ.data;
  // frozen.10 (SUP-2) + SM-sweep: both roles this screen serves have exactly one
  // site (server-scoped GET /sites) — auto-picked, never a dropdown, for either.
  const siteId: UUID | '' = sites?.[0]?.id ?? '';
  const selectedSite = sites?.find((s) => s.id === siteId);
  const orgExpense = meQ.data?.org.config.expense;
  const voiceEnabled = meQ.data?.org.config.features.voiceNotes ?? false;
  // Org-wide shops + shops at the selected site only.
  const siteVendors = (vendorsQ.data ?? []).filter((v) => v.siteId === null || v.siteId === siteId);
  // frozen.10: default ON unless the site explicitly turns it off (was accidentally default-off before).
  const vendorFieldEnabled = selectedSite?.expenseFormConfig?.fields?.vendor !== false;

  const categories: ExpenseCategoryConfig[] = (
    selectedSite?.expenseFormConfig?.categories ?? orgExpense?.categories ?? DEFAULT_EXPENSE_CATEGORIES
  ).filter((c) => c.enabled);
  const categoryLabel = (c: ExpenseCategoryConfig) => (locale === 'hi' ? c.labelHi : c.labelEn);

  // frozen.10 (SM-2): SM-created subcategories, site override falling back to org defaults.
  const subcategories: ExpenseSubcategoryConfig[] = (
    selectedSite?.expenseFormConfig?.subcategories ?? orgExpense?.subcategories ?? []
  ).filter((s) => s.enabled);
  const subcategoryLabel = (s: ExpenseSubcategoryConfig) => (locale === 'hi' ? s.labelHi : s.labelEn);

  // The SITE_MANAGER books any amount directly (it lands unverified, awaiting the accountant's
  // tick) — no per-entry direct limit applies to this screen. (The SUP-9 supervisor two-tier
  // limit was removed with the supervisor's direct-entry path; see EntryRole above.)
  const directLimitPaise: number | undefined = undefined;

  const recentWindow = { from: addDays(today, -7), to: today };
  const recentQs = siteId
    ? new URLSearchParams({ siteId, from: recentWindow.from, to: recentWindow.to }).toString()
    : '';

  return (
    <div className="grid gap-4" data-testid="expense-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.EXPENSE_UI.title}</CardTitle>
          <CardDescription>{m.EXPENSE_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* SM-sweep: no site select for either role this screen serves — both are
              server-scoped to exactly one site, always shown as a fixed label. */}
          <div className="grid gap-2">
            <Label htmlFor="expense-site">{local.site}</Label>
            {sitesQ.isPending ? (
              <LoadingState />
            ) : sitesQ.error ? (
              <ErrorState error={sitesQ.error} onRetry={() => void sitesQ.refetch()} />
            ) : !selectedSite ? (
              <EmptyState label={local.noSites} />
            ) : (
              <p
                id="expense-site"
                data-testid="expense-site-fixed"
                className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
              >
                {selectedSite.name} ({selectedSite.code})
              </p>
            )}
          </div>
          <DateSelect id="expense-date" testId="expense-date" value={date} onChange={setDate} today={today} backdateDays={backdateDaysFor(role)} />

          <Separator />

          <ExpenseForm
            siteId={siteId}
            date={date}
            categories={categories}
            categoryLabel={categoryLabel}
            subcategories={subcategories}
            subcategoryLabel={subcategoryLabel}
            directLimitPaise={directLimitPaise}
            limitsReady={!meQ.isPending}
            voiceEnabled={voiceEnabled}
            vendors={siteVendors}
            showVendorField={vendorFieldEnabled}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ['records', 'expense'] });
              void queryClient.invalidateQueries({ queryKey: ['requests'] });
            }}
          />
        </CardContent>
      </Card>

      <RecentExpenses siteId={siteId} qs={recentQs} userName={userName} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry form — limit-aware: direct booking under the limit, approval request
// over it (client pre-check), with a server-driven fallback offer too.
// ---------------------------------------------------------------------------

function ExpenseForm({
  siteId,
  date,
  categories,
  categoryLabel,
  subcategories,
  subcategoryLabel,
  directLimitPaise,
  limitsReady,
  voiceEnabled,
  vendors,
  showVendorField,
  onSaved,
}: {
  siteId: UUID | '';
  date: BusinessDate;
  categories: ExpenseCategoryConfig[];
  categoryLabel: (c: ExpenseCategoryConfig) => string;
  subcategories: ExpenseSubcategoryConfig[];
  subcategoryLabel: (s: ExpenseSubcategoryConfig) => string;
  directLimitPaise: number | undefined;
  limitsReady: boolean;
  voiceEnabled: boolean;
  vendors: Vendor[];
  showVendorField: boolean;
  onSaved: () => void;
}) {
  const m = useMessages();
  const locale = useLocale();
  const local = LOCAL_UI[locale];

  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [subcategory, setSubcategory] = useState<string>('');
  const [amountRupees, setAmountRupees] = useState('');
  const [billPhotos, setBillPhotos] = useState<File[]>([]);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [remark, setRemark] = useState('');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [paidVia, setPaidVia] = useState<PaymentMode>('CASH');
  const [vendorId, setVendorId] = useState<UUID | ''>('');

  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; category?: string; vendor?: string; remark?: string }>({});
  const [saved, setSaved] = useState<'direct' | 'request' | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);

  // Only offer the selector when the site allows it AND there's at least one shop to pick.
  const showPaidBySelector = showVendorField && vendors.length > 0;

  // frozen.10 (SM-2): subcategories are scoped to whichever category is currently picked.
  const subcategoryOptions = category ? subcategories.filter((s) => s.parent === category) : [];
  // frozen.10 (SUP-9): MISC ("Other") requires a remark describing the expense.
  const remarkRequired = category === OTHER_CATEGORY;

  const amountPaise = (() => {
    const n = Number(amountRupees);
    return Number.isFinite(n) && n > 0 ? rupeesToPaise(n) : 0;
  })();
  const overLimit = directLimitPaise !== undefined && amountPaise > 0 && amountPaise > directLimitPaise;

  const resetFields = () => {
    setCategory(undefined);
    setSubcategory('');
    setAmountRupees('');
    setBillPhotos([]);
    setExtraPhotos([]);
    setRemark('');
    setVoiceBlob(null);
    setPaidVia('CASH');
    setVendorId('');
  };

  const clearNotices = () => {
    setSaved(null);
    setPhotoWarning(false);
  };

  /** Best-effort media upload shared by both paths; returns the uploaded ids split by kind. */
  const uploadAll = async (id: UUID, parentType: 'expense' | 'approval_request') => {
    const billIds = billPhotos.length
      ? await uploadPhotos(billPhotos, { kind: 'RECEIPT', parentType, parentId: id })
      : [];
    const extraIds = extraPhotos.length
      ? await uploadPhotos(extraPhotos, { kind: 'PHOTO', parentType, parentId: id })
      : [];
    let voiceId: UUID | null = null;
    let voiceFailed = false;
    if (voiceBlob) {
      voiceId = await uploadVoice(voiceBlob, { parentType, parentId: id });
      voiceFailed = voiceId === null;
    }
    const attempted = billPhotos.length + extraPhotos.length + (voiceBlob ? 1 : 0);
    const uploaded = billIds.length + extraIds.length + (voiceId ? 1 : 0);
    return { billIds, extraIds, voiceId, failed: voiceFailed || uploaded < attempted };
  };

  const directMutation = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      const { billIds, extraIds, failed } = await uploadAll(id, 'expense');
      const input: CreateExpenseInput = {
        id,
        siteId: siteId as UUID,
        category: category as ExpenseCategory,
        subcategory: subcategory || undefined, // frozen.10 (SM-2)
        amountPaise,
        receiptMediaId: billIds[0] ?? extraIds[0],
        remark: remark.trim() ? remark.trim() : undefined, // frozen.4: persisted on direct entries too
        businessDate: date,
        // WO-10: cash is the default (paidVia omitted); "on credit" carries the shop id.
        ...(paidVia === 'VENDOR_CREDIT' ? { paidVia: 'VENDOR_CREDIT' as const, vendorId: vendorId as UUID } : {}),
      };
      await api<Expense>('POST', '/records/expense', input);
      return { failed };
    },
    onSuccess: ({ failed }) => {
      resetFields();
      setPhotoWarning(failed);
      setSaved('direct');
      onSaved();
    },
    onError: () => setSaved(null),
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      const { billIds, extraIds, voiceId, failed } = await uploadAll(id, 'approval_request');
      const mediaIds: UUID[] = [...billIds, ...extraIds, ...(voiceId ? [voiceId] : [])];
      // ExpenseRequestPayload has no `subcategory` field on the frozen contracts yet — carried
      // as an extra property (best-effort; the accountant/Owner decide form doesn't read it back
      // today, same documented gap as remark/mediaIds not round-tripping through the category-
      // override UI). Never blocks the submit.
      const payload: ExpenseRequestPayload & { subcategory?: string } = {
        siteId: siteId as UUID,
        category: category as ExpenseCategory,
        subcategory: subcategory || undefined,
        amountPaise,
        businessDate: date,
        remark: remark.trim() ? remark.trim() : undefined,
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        ...(paidVia === 'VENDOR_CREDIT' ? { paidVia: 'VENDOR_CREDIT' as const, vendorId: vendorId as UUID } : {}),
      };
      // SubmitRequestInput.payload is Record<string, unknown> (frozen contracts) — same cast the
      // worker/driver expense-request screen uses for the same reason (no index signature).
      const input: SubmitRequestInput = { id, type: 'EXPENSE_ADD', payload: payload as unknown as Record<string, unknown> };
      await api<ApprovalRequest>('POST', '/requests', input);
      return { failed };
    },
    onSuccess: ({ failed }) => {
      resetFields();
      setPhotoWarning(failed);
      setSaved('request');
      onSaved();
    },
    onError: () => setSaved(null),
  });

  const validate = (): boolean => {
    const errs: { amount?: string; category?: string; vendor?: string; remark?: string } = {};
    if (!(amountPaise > 0)) errs.amount = m.EXPENSE_UI.amountInvalid;
    if (!category) errs.category = m.EXPENSE_UI.categoryRequired;
    if (showPaidBySelector && paidVia === 'VENDOR_CREDIT' && !vendorId) errs.vendor = m.VENDOR_UI.shopRequired;
    if (remarkRequired && !remark.trim()) errs.remark = local.remarkRequiredError;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    if (!siteId || !validate()) return;
    if (overLimit) requestMutation.mutate();
    else directMutation.mutate();
  };

  const sendAsRequestInstead = () => {
    requestMutation.mutate();
  };

  const busy = directMutation.isPending || requestMutation.isPending;

  // The direct mutation's error either offers the request fallback (over-limit / outside the
  // direct-entry date window) or is a plain error; only one of the two mutations is ever "live"
  // for a given submit, so it's safe to prefer whichever currently holds an error.
  const directErr = directMutation.error;
  const fallbackEligible =
    directErr instanceof ApiClientError &&
    (directErr.fields?.amountPaise === 'OVER_DIRECT_LIMIT' || directErr.code === 'FORBIDDEN');

  const plainError = requestMutation.error
    ? apiErrorOf(m, requestMutation.error)
    : fallbackEligible
      ? null
      : apiErrorOf(m, directErr);

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label>{m.EXPENSE_UI.category}</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {categories.map((c) => (
            <Button
              key={c.key}
              type="button"
              size="sm"
              variant={category === c.key ? 'default' : 'outline'}
              aria-pressed={category === c.key}
              data-testid={`expense-category-${c.key}`}
              onClick={() => {
                setCategory(c.key);
                setSubcategory(''); // frozen.10 (SM-2): subcategories are scoped to the category
              }}
            >
              {categoryLabel(c)}
            </Button>
          ))}
        </div>
        {fieldErrors.category && (
          <p className="text-sm text-destructive" role="alert">
            {fieldErrors.category}
          </p>
        )}
      </div>

      {subcategoryOptions.length > 0 && (
        <div className="grid gap-2">
          <Label>{local.subcategoryLabel}</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {subcategoryOptions.map((s) => (
              <Button
                key={s.key}
                type="button"
                size="sm"
                variant={subcategory === s.key ? 'default' : 'outline'}
                aria-pressed={subcategory === s.key}
                data-testid={`expense-subcategory-${s.key}`}
                onClick={() => setSubcategory((cur) => (cur === s.key ? '' : s.key))}
              >
                {subcategoryLabel(s)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="expense-amount">{m.EXPENSE_UI.amountRupees}</Label>
        <Input
          id="expense-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          data-testid="expense-amount"
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
        />
        {fieldErrors.amount && (
          <p className="text-sm text-destructive" role="alert">
            {fieldErrors.amount}
          </p>
        )}
        {limitsReady && directLimitPaise !== undefined && directLimitPaise > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="expense-limit-hint">
            {m.EXPENSE_UI.limitHintPrefix} {formatPaise(directLimitPaise)}
          </p>
        )}
        {overLimit && (
          <Notice tone="warning" testId="expense-over-limit-banner">
            {m.EXPENSE_UI.overLimitBanner}
          </Notice>
        )}
      </div>

      {showPaidBySelector && (
        <div className="grid gap-2">
          <Label>{m.VENDOR_UI.paidByLabel}</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={paidVia === 'CASH' ? 'default' : 'outline'}
              aria-pressed={paidVia === 'CASH'}
              data-testid="expense-paidvia-cash"
              onClick={() => setPaidVia('CASH')}
            >
              {m.VENDOR_UI.paidByCash}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paidVia === 'VENDOR_CREDIT' ? 'default' : 'outline'}
              aria-pressed={paidVia === 'VENDOR_CREDIT'}
              data-testid="expense-paidvia-credit"
              onClick={() => setPaidVia('VENDOR_CREDIT')}
            >
              {m.VENDOR_UI.paidByCredit}
            </Button>
          </div>
          {paidVia === 'VENDOR_CREDIT' && (
            <div className="grid gap-1.5">
              <Label htmlFor="expense-vendor">{m.VENDOR_UI.shopLabel}</Label>
              <NativeSelect
                id="expense-vendor"
                data-testid="expense-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">{m.VENDOR_UI.selectShop}</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
              {fieldErrors.vendor && (
                <p className="text-sm text-destructive" role="alert">
                  {fieldErrors.vendor}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <PhotoMultiField
        files={billPhotos}
        onChange={setBillPhotos}
        max={MAX_BILL_PHOTOS}
        label={m.EXPENSE_UI.billPhotoLabel}
        testId="expense-bill-photo"
      />

      <PhotoMultiField
        files={extraPhotos}
        onChange={setExtraPhotos}
        max={MAX_EXTRA_PHOTOS}
        label={m.EXPENSE_UI.extraPhotosLabel}
        testId="expense-extra-photos"
      />

      <div className="grid gap-2">
        <Label htmlFor="expense-remark">{remarkRequired ? local.remarkRequiredLabel : m.EXPENSE_UI.remark}</Label>
        <Textarea
          id="expense-remark"
          data-testid="expense-remark"
          placeholder={m.EXPENSE_UI.remarkPlaceholder}
          value={remark}
          onChange={(e) => {
            setRemark(e.target.value);
            if (fieldErrors.remark) setFieldErrors((f) => ({ ...f, remark: undefined }));
          }}
        />
        {fieldErrors.remark && (
          <p className="text-sm text-destructive" role="alert" data-testid="expense-remark-error">
            {fieldErrors.remark}
          </p>
        )}
      </div>

      {voiceEnabled && <VoiceField value={voiceBlob} onChange={setVoiceBlob} testId="expense-voice" />}

      {fallbackEligible && (
        <Notice tone="warning" testId="expense-fallback-offer">
          <span className="grid gap-2">
            <span>{m.EXPENSE_UI.overLimitServerNotice}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              data-testid="expense-send-as-request"
              disabled={requestMutation.isPending}
              onClick={sendAsRequestInstead}
            >
              {requestMutation.isPending ? m.EXPENSE_UI.submittingRequest : m.EXPENSE_UI.sendAsRequest}
            </Button>
          </span>
        </Notice>
      )}

      {plainError && (
        <Notice tone="error" testId="expense-error">
          {plainError}
        </Notice>
      )}
      {saved === 'direct' && (
        <Notice tone="success" testId="expense-saved">
          {m.EXPENSE_UI.savedDirect}
        </Notice>
      )}
      {saved === 'request' && (
        <Notice tone="success" testId="expense-saved-request">
          {m.EXPENSE_UI.savedRequest}
        </Notice>
      )}
      {photoWarning && (
        <Notice tone="warning" testId="expense-photo-warning">
          {m.EXPENSE_UI.photoNotUploaded}
        </Notice>
      )}

      <Button type="submit" data-testid="expense-submit" disabled={busy || !siteId}>
        {busy
          ? m.EXPENSE_UI.saving
          : overLimit
            ? m.EXPENSE_UI.submitRequest
            : m.EXPENSE_UI.submitDirect}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Recent (last-7-days) list
// ---------------------------------------------------------------------------

function RecentExpenses({
  siteId,
  qs,
  userName,
}: {
  siteId: UUID | '';
  qs: string;
  userName: (id: UUID) => string;
}) {
  const m = useMessages();
  const q = useQuery({
    queryKey: ['records', 'expense', siteId],
    queryFn: () => api<Expense[]>('GET', `/records/expense?${qs}`),
    enabled: siteId !== '',
  });
  return (
    <RecentEntries
      testId="recent-expenses"
      isLoading={siteId !== '' && q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      rows={q.data?.map((e) => ({
        id: e.id,
        primary: m.EXPENSE_CATEGORY_LABELS[e.category] + (e.billNo ? ` · ${e.billNo}` : ''),
        secondary: formatPaise(e.amountPaise),
        tertiary: `${e.businessDate} · ${m.EXPENSE_UI.enteredByPrefix} ${userName(e.enteredBy)}`,
      }))}
    />
  );
}
