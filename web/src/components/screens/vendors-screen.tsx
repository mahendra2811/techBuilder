'use client';

/**
 * Vendor / shop accounts — udhaar khata (WO-10). Site-Manager screen:
 *   (a) the scoped shop list (GET /vendors — org-wide shops + shops at the
 *       SM's own site(s); backend VendorsService.list),
 *   (b) an "add shop" form (name required, phone/sells optional — the shop's
 *       site is derived server-side from the caller's own site, no picker),
 *   (c) tapping a shop opens a light list→detail split (no route change,
 *       just local state) showing the ledger (purchased / paid / balance +
 *       month-wise breakdown, GET /vendors/:id/ledger) and a "record a
 *       payment" form (POST /vendors/:id/payments).
 *
 * The list intentionally does NOT show a per-row balance chip — that would
 * mean fetching every shop's ledger up front (N+1 client calls for what is
 * meant to be a lightweight directory). Balance is shown once a shop is
 * opened, which is the "light list+detail split" alternative.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import type { CreateVendorInput, CreateVendorPaymentInput, UUID, Vendor, VendorLedger } from '@techbuilder/contracts';
import { ApiClientError, api } from '@/lib/api-client';
import { todayKolkata } from '@/lib/business-date';
import { apiErrorMessage } from '@/lib/i18n/messages';
import { useMessages } from '@/lib/i18n/locale-context';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, EmptyState, ErrorState, Notice } from '@/components/entry/states';

export function VendorsScreen() {
  const m = useMessages();
  const vendorsQ = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('GET', '/vendors') });
  const [selectedId, setSelectedId] = useState<UUID | null>(null);

  return (
    <div className="grid gap-4" data-testid="vendors-screen">
      <Card>
        <CardHeader>
          <CardTitle>{m.VENDOR_UI.title}</CardTitle>
          <CardDescription>{m.VENDOR_UI.subtitle}</CardDescription>
        </CardHeader>
      </Card>

      {selectedId ? (
        <VendorDetail
          vendorId={selectedId}
          vendorName={vendorsQ.data?.find((v) => v.id === selectedId)?.name}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <>
          <VendorList vendorsQ={vendorsQ} onSelect={setSelectedId} />
          <CreateVendorForm />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (a) Shop list
// ---------------------------------------------------------------------------

function VendorList({
  vendorsQ,
  onSelect,
}: {
  vendorsQ: ReturnType<typeof useQuery<Vendor[]>>;
  onSelect: (id: UUID) => void;
}) {
  const m = useMessages();
  return (
    <Card data-testid="vendor-list">
      <CardHeader>
        <CardTitle>{m.VENDOR_UI.listTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {vendorsQ.isPending ? (
          <LoadingState />
        ) : vendorsQ.error ? (
          <ErrorState error={vendorsQ.error} onRetry={() => void vendorsQ.refetch()} />
        ) : !vendorsQ.data || vendorsQ.data.length === 0 ? (
          <EmptyState label={m.VENDOR_UI.listEmpty} />
        ) : (
          <ul className="divide-y">
            {vendorsQ.data.map((v) => (
              <li key={v.id} data-testid={`vendor-row-${v.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0"
                  data-testid={`vendor-row-${v.id}-open`}
                  onClick={() => onSelect(v.id)}
                >
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.sells ?? m.VENDOR_UI.sellsUnknown}
                      {' · '}
                      {v.phone ?? m.VENDOR_UI.phoneUnknown}
                    </p>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground underline">{m.VENDOR_UI.viewLedger}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (b) Add shop
// ---------------------------------------------------------------------------

function CreateVendorForm() {
  const m = useMessages();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sells, setSells] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateVendorInput) => api<Vendor>('POST', '/vendors', input),
    onSuccess: () => {
      setSaved(true);
      setName('');
      setPhone('');
      setSells('');
      void queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!name.trim()) {
      setNameError(m.VENDOR_UI.nameRequired);
      return;
    }
    setNameError(null);
    const input: CreateVendorInput = {
      id: uuidv7(),
      name: name.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(sells.trim() ? { sells: sells.trim() } : {}),
    };
    create.mutate(input);
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="create-vendor">
      <CardHeader>
        <CardTitle>{m.VENDOR_UI.addShopTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="vendor-name">{m.VENDOR_UI.nameLabel}</Label>
            <Input id="vendor-name" data-testid="vendor-name" value={name} onChange={(e) => setName(e.target.value)} />
            {nameError && (
              <p className="text-sm text-destructive" role="alert">
                {nameError}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vendor-phone">{m.VENDOR_UI.phoneLabel}</Label>
            <Input id="vendor-phone" type="tel" inputMode="tel" data-testid="vendor-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vendor-sells">{m.VENDOR_UI.sellsLabel}</Label>
            <Input id="vendor-sells" data-testid="vendor-sells" value={sells} onChange={(e) => setSells(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="create-vendor-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="create-vendor-success">
              {m.VENDOR_UI.shopAdded}
            </Notice>
          )}

          <Button type="submit" data-testid="create-vendor-submit" disabled={create.isPending}>
            {create.isPending ? m.VENDOR_UI.addingShop : m.VENDOR_UI.addShopSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (c) Shop detail — ledger + record payment
// ---------------------------------------------------------------------------

function VendorDetail({ vendorId, vendorName, onBack }: { vendorId: UUID; vendorName: string | undefined; onBack: () => void }) {
  const m = useMessages();
  const ledgerQ = useQuery({
    queryKey: ['vendor-ledger', vendorId],
    queryFn: () => api<VendorLedger>('GET', `/vendors/${vendorId}/ledger`),
  });

  return (
    <div className="grid gap-4" data-testid="vendor-detail">
      <Button type="button" variant="outline" size="sm" className="w-fit" data-testid="vendor-detail-back" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {m.VENDOR_UI.backToList}
      </Button>

      <Card data-testid="vendor-ledger">
        <CardHeader>
          <CardTitle>{vendorName ?? ledgerQ.data?.name ?? m.VENDOR_UI.ledgerTitle}</CardTitle>
          <CardDescription>{m.VENDOR_UI.ledgerTitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ledgerQ.isPending ? (
            <LoadingState />
          ) : ledgerQ.error ? (
            <ErrorState error={ledgerQ.error} onRetry={() => void ledgerQ.refetch()} />
          ) : ledgerQ.data ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{m.VENDOR_UI.purchasedLabel}</p>
                  <p className="text-sm font-medium" data-testid="vendor-ledger-purchased">
                    {formatPaise(ledgerQ.data.purchasedPaise)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{m.VENDOR_UI.paidLabel}</p>
                  <p className="text-sm font-medium" data-testid="vendor-ledger-paid">
                    {formatPaise(ledgerQ.data.paidPaise)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{m.VENDOR_UI.balanceLabel}</p>
                  <p className="text-sm font-semibold" data-testid="vendor-ledger-balance">
                    {formatPaise(ledgerQ.data.balancePaise)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-2">
                <p className="text-sm font-medium">{m.VENDOR_UI.monthsTitle}</p>
                {ledgerQ.data.months.length === 0 ? (
                  <EmptyState label={m.VENDOR_UI.monthsEmpty} />
                ) : (
                  <ul className="divide-y" data-testid="vendor-ledger-months">
                    {ledgerQ.data.months.map((row) => (
                      <li key={row.month} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                        <span className="font-medium">{row.month}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.VENDOR_UI.monthPurchased} {formatPaise(row.purchasedPaise)} · {m.VENDOR_UI.monthPaid}{' '}
                          {formatPaise(row.paidPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <RecordPaymentForm vendorId={vendorId} />
    </div>
  );
}

function RecordPaymentForm({ vendorId }: { vendorId: UUID }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKolkata(), []);

  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const amountPaise = (() => {
    const n = Number(amountRupees);
    return Number.isFinite(n) && n > 0 ? rupeesToPaise(n) : 0;
  })();

  const create = useMutation({
    mutationFn: (input: Omit<CreateVendorPaymentInput, 'vendorId'>) =>
      api('POST', `/vendors/${vendorId}/payments`, input),
    onSuccess: () => {
      setSaved(true);
      setAmountRupees('');
      setDate(today);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['vendor-ledger', vendorId] });
    },
    onError: () => setSaved(false),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!(amountPaise > 0)) {
      setAmountError(m.VENDOR_UI.amountInvalid);
      return;
    }
    setAmountError(null);
    create.mutate({
      id: uuidv7(),
      amountPaise,
      businessDate: date,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  const serverError =
    create.error instanceof ApiClientError ? apiErrorMessage(m, create.error.code) : create.error ? apiErrorMessage(m) : null;

  return (
    <Card data-testid="vendor-record-payment">
      <CardHeader>
        <CardTitle>{m.VENDOR_UI.recordPaymentTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="vendor-payment-amount">{m.VENDOR_UI.amountLabel}</Label>
            <Input
              id="vendor-payment-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              data-testid="vendor-payment-amount"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
            />
            {amountError && (
              <p className="text-sm text-destructive" role="alert">
                {amountError}
              </p>
            )}
          </div>

          <DateField id="vendor-payment-date" testId="vendor-payment-date" value={date} onChange={setDate} max={today} />

          <div className="grid gap-2">
            <Label htmlFor="vendor-payment-note">{m.VENDOR_UI.noteLabel}</Label>
            <Input id="vendor-payment-note" data-testid="vendor-payment-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {serverError && (
            <Notice tone="error" testId="vendor-payment-error">
              {serverError}
            </Notice>
          )}
          {saved && (
            <Notice tone="success" testId="vendor-payment-success">
              {m.VENDOR_UI.paymentSaved}
            </Notice>
          )}

          <Button type="submit" data-testid="vendor-payment-submit" disabled={create.isPending}>
            {create.isPending ? m.VENDOR_UI.savingPayment : m.VENDOR_UI.paymentSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
