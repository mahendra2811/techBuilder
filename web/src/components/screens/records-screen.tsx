'use client';

/**
 * Records page (SM + TH): Expense entry + Progress note as two sub-tabs.
 * Site + date are shared at the top (both entries are for the same site/day in
 * the normal flow — fewer taps on mobile). Money is entered in RUPEES and sent
 * as INTEGER PAISE. Photos are best-effort: a failed upload never blocks the
 * record (non-blocking "photo not uploaded" notice instead).
 */
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { uuidv7 } from 'uuidv7';
import { EXPENSE_CATEGORIES } from '@techbuilder/contracts';
import type {
  BusinessDate,
  CreateExpenseInput,
  CreateProgressNoteInput,
  Expense,
  ExpenseCategory,
  ProgressNote,
  Site,
  UUID,
} from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { addDays, minEntryDate, todayKolkata } from '@/lib/business-date';
import { uploadPhoto } from '@/lib/media-upload';
import { NOTHING_TO_REPORT_TEXT, apiErrorMessage, type Messages } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/entry/date-field';
import { PhotoField } from '@/components/entry/photo-field';
import { RecentEntries } from '@/components/entry/recent-entries';
import { SitePicker } from '@/components/entry/site-picker';
import { Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type EntryRole = 'SITE_MANAGER' | 'TEAM_HEAD';
type Tab = 'expense' | 'progress';

// Local FORM schema only (UX). The DTO shape comes from the frozen contracts;
// the enum values are imported, never redefined. Built per-locale (messages).
const makeExpenseFormSchema = (e: Messages['ENTRY_UI']) =>
  z.object({
    amountRupees: z
      .string()
      .min(1, e.amountInvalid)
      .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, e.amountInvalid),
    category: z.enum(EXPENSE_CATEGORIES, { errorMap: () => ({ message: e.categoryRequired }) }),
    billNo: z.string().optional(),
  });
type ExpenseForm = z.infer<ReturnType<typeof makeExpenseFormSchema>>;

export function RecordsScreen({ role }: { role: EntryRole }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);
  const [tab, setTab] = useState<Tab>('expense');
  const [date, setDate] = useState<BusinessDate>(today);
  const [pickedSiteId, setPickedSiteId] = useState<UUID | ''>('');

  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  // Default to the first scoped site (TH has exactly one) — derived, no effect.
  const sites = sitesQ.data;
  const siteId: UUID | '' = pickedSiteId !== '' ? pickedSiteId : (sites?.[0]?.id ?? '');

  const recentWindow = { from: addDays(today, -7), to: today };
  const recentParams = (extra: Record<string, string>) =>
    new URLSearchParams({ ...extra, from: recentWindow.from, to: recentWindow.to }).toString();

  return (
    <div className="grid gap-4" data-testid="records-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.ENTRY_UI.recordsTitle}</CardTitle>
          <CardDescription>{m.ENTRY_UI.recordsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SitePicker sites={sites} isLoading={sitesQ.isPending} value={siteId} onChange={setPickedSiteId} />
          <DateField
            id="records-date"
            testId="records-date"
            value={date}
            onChange={setDate}
            min={minEntryDate(role, today)}
            max={today}
          />

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(['expense', 'progress'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                data-testid={`records-tab-${t}`}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(t)}
              >
                {t === 'expense' ? m.ENTRY_UI.tabExpense : m.ENTRY_UI.tabProgress}
              </button>
            ))}
          </div>

          <Separator />

          {tab === 'expense' ? (
            <ExpenseEntry siteId={siteId} date={date} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['records', 'expense'] })} />
          ) : (
            <ProgressEntry siteId={siteId} date={date} onSaved={() => void queryClient.invalidateQueries({ queryKey: ['records', 'progress'] })} />
          )}
        </CardContent>
      </Card>

      {tab === 'expense' ? (
        <RecentExpenses siteId={siteId} qs={siteId ? recentParams({ siteId }) : ''} />
      ) : (
        <RecentProgress siteId={siteId} qs={siteId ? recentParams({ siteId }) : ''} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expense form (react-hook-form + local zod schema)
// ---------------------------------------------------------------------------

function ExpenseEntry({ siteId, date, onSaved }: { siteId: UUID | ''; date: BusinessDate; onSaved: () => void }) {
  const m = useMessages();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [saved, setSaved] = useState(false);

  // Mirror the selected category in plain state for button styling (RHF's
  // watch() is incompatible with the React Compiler; the zod schema still
  // validates the field via setValue below).
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExpenseForm>({
    resolver: zodResolver(useMemo(() => makeExpenseFormSchema(m.ENTRY_UI), [m])),
    defaultValues: { amountRupees: '', billNo: '' },
  });

  const mutation = useMutation({
    mutationFn: async (values: ExpenseForm) => {
      const id = uuidv7();
      let receiptMediaId: UUID | undefined;
      let photoFailed = false;
      if (photo) {
        const mediaId = await uploadPhoto(photo, { kind: 'RECEIPT', parentType: 'expense', parentId: id });
        if (mediaId) receiptMediaId = mediaId;
        else photoFailed = true;
      }
      const input: CreateExpenseInput = {
        id,
        siteId: siteId as UUID,
        category: values.category,
        amountPaise: rupeesToPaise(Number(values.amountRupees)),
        billNo: values.billNo?.trim() ? values.billNo.trim() : undefined,
        receiptMediaId,
        businessDate: date,
      };
      await api<Expense>('POST', '/records/expense', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => {
      reset();
      setCategory(undefined);
      setPhoto(null);
      setPhotoWarning(photoFailed);
      setSaved(true);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={handleSubmit((values) => {
        setSaved(false);
        setPhotoWarning(false);
        mutation.mutate(values);
      })}
    >
      <p className="text-sm font-medium">{m.ENTRY_UI.expenseTitle}</p>

      <div className="grid gap-2">
        <Label>{m.ENTRY_UI.category}</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={category === c ? 'default' : 'outline'}
              aria-pressed={category === c}
              data-testid={`expense-category-${c}`}
              onClick={() => {
                setCategory(c);
                setValue('category', c, { shouldValidate: true });
              }}
            >
              {m.EXPENSE_CATEGORY_LABELS[c]}
            </Button>
          ))}
        </div>
        {errors.category && (
          <p className="text-sm text-destructive" role="alert">
            {errors.category.message}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="expense-amount">{m.ENTRY_UI.amountRupees}</Label>
        <Input
          id="expense-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          data-testid="expense-amount"
          {...register('amountRupees')}
        />
        {errors.amountRupees && (
          <p className="text-sm text-destructive" role="alert">
            {errors.amountRupees.message}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="expense-bill-no">{m.ENTRY_UI.billNo}</Label>
        <Input id="expense-bill-no" data-testid="expense-bill-no" {...register('billNo')} />
      </div>

      <PhotoField file={photo} onChange={setPhoto} testId="expense-photo" />

      {serverError && (
        <Notice tone="error" testId="expense-error">
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId="expense-saved">
          {m.ENTRY_UI.expenseSaved}
        </Notice>
      )}
      {photoWarning && (
        <Notice tone="warning" testId="expense-photo-warning">
          {m.ENTRY_UI.photoNotUploaded}
        </Notice>
      )}

      <Button type="submit" data-testid="expense-submit" disabled={mutation.isPending || !siteId}>
        {mutation.isPending ? m.ENTRY_UI.saving : m.ENTRY_UI.expenseSubmit}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Progress note form
// ---------------------------------------------------------------------------

function ProgressEntry({ siteId, date, onSaved }: { siteId: UUID | ''; date: BusinessDate; onSaved: () => void }) {
  const m = useMessages();
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState(false);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async (noteText: string) => {
      const id = uuidv7();
      let mediaIds: UUID[] | undefined;
      let photoFailed = false;
      if (photo) {
        const mediaId = await uploadPhoto(photo, { kind: 'PHOTO', parentType: 'progress', parentId: id });
        if (mediaId) mediaIds = [mediaId];
        else photoFailed = true;
      }
      const input: CreateProgressNoteInput = {
        id,
        siteId: siteId as UUID,
        text: noteText,
        businessDate: date,
        mediaIds,
      };
      await api<ProgressNote>('POST', '/records/progress', input);
      return { photoFailed };
    },
    onSuccess: ({ photoFailed }) => {
      setText('');
      setPhoto(null);
      setPhotoWarning(photoFailed);
      setSaved(true);
      onSaved();
    },
    onError: () => setSaved(false),
  });

  const submit = (noteText: string) => {
    if (!siteId || mutation.isPending) return;
    if (!noteText.trim()) {
      setTextError(m.ENTRY_UI.progressTextRequired);
      return;
    }
    setTextError(null);
    setSaved(false);
    setPhotoWarning(false);
    mutation.mutate(noteText.trim());
  };

  const serverError =
    mutation.error instanceof ApiClientError
      ? apiErrorMessage(m, mutation.error.code)
      : mutation.error
        ? apiErrorMessage(m)
        : null;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
    >
      <p className="text-sm font-medium">{m.ENTRY_UI.progressTitle}</p>

      <div className="grid gap-2">
        <Label htmlFor="progress-text" className="sr-only">
          {m.ENTRY_UI.progressTitle}
        </Label>
        <Textarea
          id="progress-text"
          data-testid="progress-text"
          placeholder={m.ENTRY_UI.progressPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {textError && (
          <p className="text-sm text-destructive" role="alert">
            {textError}
          </p>
        )}
      </div>

      <PhotoField file={photo} onChange={setPhoto} testId="progress-photo" />

      {serverError && (
        <Notice tone="error" testId="progress-error">
          {serverError}
        </Notice>
      )}
      {saved && (
        <Notice tone="success" testId="progress-saved">
          {m.ENTRY_UI.progressSaved}
        </Notice>
      )}
      {photoWarning && (
        <Notice tone="warning" testId="progress-photo-warning">
          {m.ENTRY_UI.photoNotUploaded}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="progress-nothing"
          disabled={mutation.isPending || !siteId}
          onClick={() => submit(NOTHING_TO_REPORT_TEXT)}
        >
          {m.ENTRY_UI.nothingToReport}
        </Button>
        <Button type="submit" data-testid="progress-submit" disabled={mutation.isPending || !siteId}>
          {mutation.isPending ? m.ENTRY_UI.saving : m.ENTRY_UI.progressSubmit}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Recent (last-7-days) lists
// ---------------------------------------------------------------------------

function RecentExpenses({ siteId, qs }: { siteId: UUID | ''; qs: string }) {
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
        tertiary: e.businessDate,
      }))}
    />
  );
}

function RecentProgress({ siteId, qs }: { siteId: UUID | ''; qs: string }) {
  const q = useQuery({
    queryKey: ['records', 'progress', siteId],
    queryFn: () => api<ProgressNote[]>('GET', `/records/progress?${qs}`),
    enabled: siteId !== '',
  });
  return (
    <RecentEntries
      testId="recent-progress"
      isLoading={siteId !== '' && q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      rows={q.data?.map((n) => ({
        id: n.id,
        primary: n.text,
        tertiary: n.businessDate,
      }))}
    />
  );
}
