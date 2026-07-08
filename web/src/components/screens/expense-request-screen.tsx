'use client';

/**
 * Worker/Driver EXPENSE-ADD request form (WO-5). Field roles (`request.submit`
 * scope SELF/OWN_VEHICLE) cannot enter an expense directly — they ask, and a
 * TH/SM approves it (approvals.service materializes the booked expense on
 * APPROVE). Money is entered in RUPEES and sent as INTEGER PAISE.
 *
 * Config resolution mirrors the backend's `loadExpenseLimits` EXACTLY (see
 * backend/src/common/org-config.util.ts) so the client rarely bounces off a
 * server VALIDATION_FAILED/FORBIDDEN:
 *   - cap        = site.expenseFormConfig.requestCapPaise ?? org.expense.requestCapPaise
 *   - categories = site.expenseFormConfig.categories ?? org.expense.categories (enabled only)
 *   - backdate   = org.expense.requestBackdateDays (site does NOT override this)
 * `siteId` is never sent — the server derives it for WORKER/DRIVER.
 *
 * Photos + the voice note are uploaded (best-effort, never throws) at submit
 * time and their media ids all land in the one `mediaIds` array on the
 * payload; the first photo is treated as the "bill" (approvals.service reads
 * `mediaIds[0]` as the receipt when it books the expense).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import type {
  ApprovalRequest,
  BusinessDate,
  ExpenseCategory,
  ExpenseCategoryConfig,
  ExpenseRequestPayload,
  OrgConfig,
  PaymentMode,
  Site,
  SubmitRequestInput,
  UUID,
  Vendor,
} from '@techbuilder/contracts';
import { ApiClientError, api, me } from '@/lib/api-client';
import { addDays, formatBusinessDateShort, todayKolkata } from '@/lib/business-date';
import { uploadPhotos, uploadVoice } from '@/lib/media-upload';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PhotoMultiField } from '@/components/entry/photo-multi-field';
import { VoiceField } from '@/components/entry/voice-field';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';
import { MyExpenseRequests } from '@/components/requests/my-requests';

const MAX_PHOTOS = 3;

export function ExpenseRequestScreen({ variant }: { variant: 'worker' | 'driver' }) {
  const m = useMessages();

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  // WO-10: udhaar-khata shops for the "paid by cash / on credit" selector.
  const vendorsQ = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('GET', '/vendors') });

  const org = meQ.data?.org;
  const site = sitesQ.data?.[0];

  const isLoading = meQ.isPending || sitesQ.isPending;
  const loadError = meQ.error ?? sitesQ.error;

  return (
    <div className="grid gap-4" data-testid={`expense-request-screen-${variant}`}>
      <Card>
        <CardHeader>
          <CardTitle>{m.EXPENSE_REQUEST_UI.title}</CardTitle>
          <CardDescription>{m.EXPENSE_REQUEST_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : loadError ? (
            <ErrorState error={loadError} onRetry={() => void (meQ.error ? meQ.refetch() : sitesQ.refetch())} />
          ) : !site || !org ? (
            <Notice tone="warning" testId="expense-request-no-site">
              {m.EXPENSE_REQUEST_UI.noSite}
            </Notice>
          ) : (
            <ExpenseRequestForm site={site} orgConfig={org.config} vendors={vendorsQ.data ?? []} />
          )}
        </CardContent>
      </Card>

      <MyExpenseRequests />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function ExpenseRequestForm({ site, orgConfig, vendors }: { site: Site; orgConfig: OrgConfig; vendors: Vendor[] }) {
  const m = useMessages();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const today = useMemo(() => todayKolkata(), []);
  const backdateDays = orgConfig.expense.requestBackdateDays;
  const allowedDates = useMemo<BusinessDate[]>(
    () => Array.from({ length: backdateDays + 1 }, (_, i) => addDays(today, -i)),
    [today, backdateDays],
  );

  const capPaise = site.expenseFormConfig?.requestCapPaise ?? orgConfig.expense.requestCapPaise;
  const categories = (site.expenseFormConfig?.categories ?? orgConfig.expense.categories).filter((c) => c.enabled);

  const fieldToggles = site.expenseFormConfig?.fields;
  const showBillPhoto = fieldToggles?.billPhoto ?? true;
  const showExtraPhotos = fieldToggles?.extraPhotos ?? true;
  const showRemark = fieldToggles?.remark ?? true;
  const showVoiceNote = orgConfig.features.voiceNotes && (fieldToggles?.voiceNote ?? true);
  const showPhotoField = showBillPhoto || showExtraPhotos;
  const maxPhotos = showExtraPhotos ? MAX_PHOTOS : showBillPhoto ? 1 : 0;

  // WO-10: org-wide shops + shops at this site; the selector only shows when the
  // site allows it (field toggle) AND there's at least one shop to pick from.
  const siteVendors = vendors.filter((v) => v.siteId === null || v.siteId === site.id);
  const showVendorSelector = fieldToggles?.vendor !== false && siteVendors.length > 0;

  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState<BusinessDate>(today);
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [remark, setRemark] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [paidVia, setPaidVia] = useState<PaymentMode>('CASH');
  const [vendorId, setVendorId] = useState<UUID | ''>('');

  const [errors, setErrors] = useState<{ amount?: string; category?: string; vendor?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [mediaWarning, setMediaWarning] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const id = uuidv7();
      const mediaIds: UUID[] = [];
      let mediaFailed = false;

      if (photos.length > 0) {
        const uploaded = await uploadPhotos(photos, { kind: 'RECEIPT', parentType: 'approval_request', parentId: id });
        mediaIds.push(...uploaded);
        if (uploaded.length < photos.length) mediaFailed = true;
      }
      if (voice) {
        const voiceId = await uploadVoice(voice, { parentType: 'approval_request', parentId: id });
        if (voiceId) mediaIds.push(voiceId);
        else mediaFailed = true;
      }

      const payload: ExpenseRequestPayload = {
        category: category as ExpenseCategory,
        amountPaise: rupeesToPaise(Number(amountRupees)),
        businessDate: date,
        remark: remark.trim() ? remark.trim() : undefined,
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        // WO-10: cash is the default (paidVia omitted); "on credit" carries the shop id.
        ...(paidVia === 'VENDOR_CREDIT' ? { paidVia: 'VENDOR_CREDIT' as const, vendorId: vendorId as UUID } : {}),
      };
      const input: SubmitRequestInput = { id, type: 'EXPENSE_ADD', payload: payload as unknown as Record<string, unknown> };
      await api<ApprovalRequest>('POST', '/requests', input);
      return { mediaFailed };
    },
    onSuccess: ({ mediaFailed }) => {
      setAmountRupees('');
      setDate(today);
      setCategory(undefined);
      setRemark('');
      setPhotos([]);
      setVoice(null);
      setPaidVia('CASH');
      setVendorId('');
      setMediaWarning(mediaFailed);
      setSubmitted(true);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: () => setSubmitted(false),
  });

  const validate = (): boolean => {
    const errs: { amount?: string; category?: string; vendor?: string } = {};
    const amountPaise = rupeesToPaise(Number(amountRupees));
    if (!amountRupees || !Number.isFinite(amountPaise) || amountPaise <= 0) {
      errs.amount = m.EXPENSE_REQUEST_UI.amountInvalid;
    } else if (amountPaise > capPaise) {
      errs.amount = `${m.EXPENSE_REQUEST_UI.amountOverCapPrefix} ${formatPaise(capPaise)}${m.EXPENSE_REQUEST_UI.amountOverCapSuffix}`;
    }
    if (!category) errs.category = m.EXPENSE_REQUEST_UI.categoryRequired;
    if (showVendorSelector && paidVia === 'VENDOR_CREDIT' && !vendorId) errs.vendor = m.VENDOR_UI.shopRequired;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  const dateLabel = (d: BusinessDate, index: number): string => {
    if (index === 0) return m.EXPENSE_REQUEST_UI.dateToday;
    if (index === 1) return m.EXPENSE_REQUEST_UI.dateYesterday;
    return formatBusinessDateShort(d);
  };

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(false);
        setMediaWarning(false);
        if (!validate()) return;
        mutation.mutate();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="expense-request-amount">{m.EXPENSE_REQUEST_UI.amountLabel}</Label>
        <Input
          id="expense-request-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          data-testid="expense-request-amount"
          value={amountRupees}
          onChange={(e) => setAmountRupees(e.target.value)}
        />
        {errors.amount && (
          <p className="text-sm text-destructive" role="alert" data-testid="expense-request-amount-error">
            {errors.amount}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="expense-request-date">{m.EXPENSE_REQUEST_UI.dateLabel}</Label>
        <NativeSelect
          id="expense-request-date"
          data-testid="expense-request-date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        >
          {allowedDates.map((d, i) => (
            <option key={d} value={d}>
              {dateLabel(d, i)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label>{m.EXPENSE_REQUEST_UI.categoryLabel}</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {categories.map((c: ExpenseCategoryConfig) => (
            <Button
              key={c.key}
              type="button"
              size="sm"
              variant={category === c.key ? 'default' : 'outline'}
              aria-pressed={category === c.key}
              data-testid={`expense-request-category-${c.key}`}
              onClick={() => setCategory(c.key)}
            >
              {locale === 'hi' ? c.labelHi : c.labelEn}
            </Button>
          ))}
        </div>
        {errors.category && (
          <p className="text-sm text-destructive" role="alert" data-testid="expense-request-category-error">
            {errors.category}
          </p>
        )}
      </div>

      {showVendorSelector && (
        <div className="grid gap-2">
          <Label>{m.VENDOR_UI.paidByLabel}</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={paidVia === 'CASH' ? 'default' : 'outline'}
              aria-pressed={paidVia === 'CASH'}
              data-testid="expense-request-paidvia-cash"
              onClick={() => setPaidVia('CASH')}
            >
              {m.VENDOR_UI.paidByCash}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paidVia === 'VENDOR_CREDIT' ? 'default' : 'outline'}
              aria-pressed={paidVia === 'VENDOR_CREDIT'}
              data-testid="expense-request-paidvia-credit"
              onClick={() => setPaidVia('VENDOR_CREDIT')}
            >
              {m.VENDOR_UI.paidByCredit}
            </Button>
          </div>
          {paidVia === 'VENDOR_CREDIT' && (
            <div className="grid gap-1.5">
              <Label htmlFor="expense-request-vendor">{m.VENDOR_UI.shopLabel}</Label>
              <NativeSelect
                id="expense-request-vendor"
                data-testid="expense-request-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">{m.VENDOR_UI.selectShop}</option>
                {siteVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
              {errors.vendor && (
                <p className="text-sm text-destructive" role="alert" data-testid="expense-request-vendor-error">
                  {errors.vendor}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {showPhotoField && (
        <PhotoMultiField
          files={photos}
          onChange={setPhotos}
          max={maxPhotos}
          label={m.EXPENSE_REQUEST_UI.photosLabel}
          testId="expense-request-photos"
        />
      )}

      {showRemark && (
        <div className="grid gap-2">
          <Label htmlFor="expense-request-remark">{m.EXPENSE_REQUEST_UI.remarkLabel}</Label>
          <Textarea
            id="expense-request-remark"
            data-testid="expense-request-remark"
            placeholder={m.EXPENSE_REQUEST_UI.remarkPlaceholder}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </div>
      )}

      {showVoiceNote && <VoiceField value={voice} onChange={setVoice} testId="expense-request-voice" />}

      {serverError && (
        <Notice tone="error" testId="expense-request-error">
          {serverError}
        </Notice>
      )}
      {submitted && (
        <Notice tone="success" testId="expense-request-submitted">
          {m.EXPENSE_REQUEST_UI.submitted}
        </Notice>
      )}
      {mediaWarning && (
        <Notice tone="warning" testId="expense-request-media-warning">
          {m.EXPENSE_REQUEST_UI.mediaNotUploaded}
        </Notice>
      )}

      <Button type="submit" data-testid="expense-request-submit" disabled={mutation.isPending}>
        {mutation.isPending ? m.EXPENSE_REQUEST_UI.submitting : m.EXPENSE_REQUEST_UI.submit}
      </Button>
    </form>
  );
}
