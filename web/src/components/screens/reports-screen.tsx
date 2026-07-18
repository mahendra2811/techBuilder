'use client';

/**
 * Excel export v2 (/owner/reports, /site-manager/reports) — window picker
 * (Today/7d/30d/90d/custom) + a checkbox section picker (default: Expenses +
 * Cash khata), builds a multi-sheet ExcelJS workbook (lib/export-excel) from
 * ONLY the checked sections, and either downloads it in-browser or — when the
 * backend has SMTP configured — sends it by email (built server-side, so a
 * long window never blocks the browser tab). Each section's queries are
 * `enabled` only when checked, so the default view stays fast: two small
 * fetches instead of the whole org's history.
 */
import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Mail } from 'lucide-react';
import type {
  Attendance,
  CashTransfer,
  Expense,
  FuelLog,
  Issue,
  LedgerRollupRow,
  MaterialTxn,
  Person,
  ProgressNote,
  Site,
  Trip,
  User,
  Vehicle,
  VehicleLog,
  Vendor,
  VendorLedger,
} from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { addDays, formatKolkataDateTime, todayKolkata } from '@/lib/business-date';
import {
  buildAttendanceSheet,
  buildCashTransferSheet,
  buildExpenseSheet,
  buildFuelSheet,
  buildIssueSheet,
  buildLedgerRollupSheet,
  buildMaterialSheet,
  buildPeopleSheet,
  buildProgressSheet,
  buildSiteSummarySheet,
  buildSummarySheet,
  buildTripSheet,
  buildVehicleLogSheet,
  buildVendorMonthsSheet,
  buildVendorSheet,
  buildWorkbook,
  downloadWorkbook,
  exportFileName,
  type SectionSummary,
  type SheetSpec,
} from '@/lib/export-excel';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WindowToggle } from '@/components/owner/window-toggle';
import { DateField } from '@/components/entry/date-field';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';
import { cn } from '@/lib/utils';

type ReportWindow = 'today' | '7d' | '30d' | '90d' | 'custom';
type SectionKey =
  | 'expense'
  | 'money'
  | 'vendor'
  | 'attendance'
  | 'progress'
  | 'siteSummary'
  | 'material'
  | 'fleet'
  | 'issue'
  | 'people';
type Group = 'money' | 'site' | 'vehicles' | 'other';

const GROUPS: { group: Group; sections: SectionKey[] }[] = [
  { group: 'money', sections: ['expense', 'money', 'vendor'] },
  { group: 'site', sections: ['attendance', 'progress', 'siteSummary'] },
  { group: 'vehicles', sections: ['fleet'] },
  { group: 'other', sections: ['issue', 'people'] },
];
const DEFAULT_SECTIONS: SectionKey[] = ['expense', 'money'];
const EMAIL_STORAGE_KEY = 'techbuilder:reportEmail';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function groupLabel(m: Messages, g: Group): string {
  return { money: m.EXPORT_UI.groupMoney, site: m.EXPORT_UI.groupSite, vehicles: m.EXPORT_UI.groupVehicles, other: m.EXPORT_UI.groupOther }[
    g
  ];
}

function sectionLabel(m: Messages, s: SectionKey): string {
  return {
    expense: m.EXPORT_UI.sectionExpense,
    money: m.EXPORT_UI.sectionMoney,
    vendor: m.EXPORT_UI.sectionVendor,
    attendance: m.EXPORT_UI.sectionAttendance,
    progress: m.EXPORT_UI.sectionProgress,
    siteSummary: m.EXPORT_UI.sectionSiteSummary,
    material: m.EXPORT_UI.sectionMaterial,
    fleet: m.EXPORT_UI.sectionFleet,
    issue: m.EXPORT_UI.sectionIssue,
    people: m.EXPORT_UI.sectionPeople,
  }[s];
}

const windowOptions = (m: Messages) =>
  [
    { value: 'today', label: m.EXPORT_UI.windowToday },
    { value: '7d', label: m.OWNER_UI.window7d },
    { value: '30d', label: m.OWNER_UI.window30d },
    { value: '90d', label: m.EXPORT_UI.window90d },
    { value: 'custom', label: m.EXPORT_UI.windowCustom },
  ] as const;

const WINDOW_DAYS_BACK: Record<Exclude<ReportWindow, 'custom'>, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

interface ExportConfig {
  emailEnabled: boolean;
}

export function ReportsScreen() {
  const m = useMessages();
  const locale = useLocale();
  const today = useMemo(() => todayKolkata(), []);

  const [win, setWin] = useState<ReportWindow>('7d');
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const from = win === 'custom' ? customFrom : addDays(today, -WINDOW_DAYS_BACK[win]);
  const to = win === 'custom' ? customTo : today;

  const [checked, setChecked] = useState<Set<SectionKey>>(new Set(DEFAULT_SECTIONS));
  const toggleSection = (s: SectionKey) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const [delivery, setDelivery] = useState<'download' | 'email'>('download');
  // Lazy initializer only — the email block itself never appears in the SSR/first-hydration
  // pass (it's gated behind the async exports/config fetch), so reading localStorage here
  // cannot cause a hydration mismatch; avoids a setState-in-effect on mount.
  const [email, setEmail] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? ''));
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [downloaded, setDownloaded] = useState(false);

  const onEmailChange = (value: string) => {
    setEmail(value);
    window.localStorage.setItem(EMAIL_STORAGE_KEY, value);
  };

  // ---- section needs (siteSummary quietly pulls in its inputs' data) ----
  const needsAttendance = checked.has('attendance') || checked.has('siteSummary');
  const needsExpense = checked.has('expense') || checked.has('siteSummary');
  const needsProgress = checked.has('progress') || checked.has('siteSummary');
  const needsIssue = checked.has('issue') || checked.has('siteSummary');
  const needsFuel = checked.has('fleet') || checked.has('siteSummary');
  const needsVendorLookup = checked.has('vendor') || checked.has('expense');

  // ---- always-fetched reference lookups (cheap, org-wide, name joins for most sheets) ----
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const vehiclesQ = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('GET', '/vehicles') });
  const sites = sitesQ.data ?? [];

  // ---- conditional, windowed / heavier queries ----
  const expensesQ = useQuery({
    queryKey: ['records', 'expense', 'all', from, to],
    queryFn: () => api<Expense[]>('GET', `/records/expense?from=${from}&to=${to}`),
    enabled: needsExpense,
  });
  const attQs = useQueries({
    queries: sites.map((s) => ({
      queryKey: ['attendance', s.id, from, to],
      queryFn: () => api<Attendance[]>('GET', `/attendance?siteId=${s.id}&from=${from}&to=${to}`),
      enabled: needsAttendance,
    })),
  });
  // `!isFetching` matters here: WO-6's keepPreviousData keeps the PREVIOUS window's
  // data visible during a refetch, so `.data !== undefined` alone would flag a
  // section "ready" with stale-window rows while the current window is still loading.
  const attendanceReady =
    !needsAttendance || (sitesQ.data !== undefined && attQs.every((q) => q.data !== undefined && !q.isFetching));
  const attendance: Attendance[] = attendanceReady ? attQs.flatMap((q) => q.data ?? []) : [];

  const cashTransfersQ = useQuery({
    queryKey: ['cash-transfers', 'export', from, to],
    queryFn: () => api<CashTransfer[]>('GET', `/cash-transfers?from=${from}&to=${to}&limit=500`),
    enabled: checked.has('money'),
  });
  const ledgerRollupQ = useQuery({
    // Same key as ledger-screen.tsx's identical /ledger/rollup fetch — shares cache.
    queryKey: ['ledger-rollup'],
    queryFn: () => api<LedgerRollupRow[]>('GET', '/ledger/rollup'),
    enabled: checked.has('money'),
  });

  const vendorsQ = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api<Vendor[]>('GET', '/vendors'),
    enabled: needsVendorLookup,
  });
  const vendorLedgerQs = useQueries({
    queries: (vendorsQ.data ?? []).map((v) => ({
      queryKey: ['vendor-ledger', v.id],
      queryFn: () => api<VendorLedger>('GET', `/vendors/${v.id}/ledger`),
      enabled: checked.has('vendor') && vendorsQ.data !== undefined,
    })),
  });
  const vendorLedgersReady = !checked.has('vendor') || (vendorsQ.data !== undefined && vendorLedgerQs.every((q) => q.data !== undefined));
  const vendorLedgers = useMemo(() => {
    const map = new Map<string, VendorLedger>();
    (vendorsQ.data ?? []).forEach((v, i) => {
      const d = vendorLedgerQs[i]?.data;
      if (d) map.set(v.id, d);
    });
    return map;
  }, [vendorsQ.data, vendorLedgerQs]);

  const progressQ = useQuery({
    queryKey: ['records', 'progress', 'all', from, to],
    queryFn: () => api<ProgressNote[]>('GET', `/records/progress?from=${from}&to=${to}`),
    enabled: needsProgress,
  });
  const materialQ = useQuery({
    queryKey: ['records', 'material-txn', 'all', from, to],
    queryFn: () => api<MaterialTxn[]>('GET', `/records/material-txn?from=${from}&to=${to}`),
    enabled: checked.has('material'),
  });
  const fuelQ = useQuery({
    queryKey: ['records', 'fuel', 'all', from, to],
    queryFn: () => api<FuelLog[]>('GET', `/records/fuel?from=${from}&to=${to}`),
    enabled: needsFuel,
  });
  const vehicleLogQ = useQuery({
    queryKey: ['records', 'vehicle-log', 'all', from, to],
    queryFn: () => api<VehicleLog[]>('GET', `/records/vehicle-log?from=${from}&to=${to}`),
    enabled: checked.has('fleet'),
  });
  const tripQ = useQuery({
    queryKey: ['records', 'trip', 'all', from, to],
    queryFn: () => api<Trip[]>('GET', `/records/trip?from=${from}&to=${to}`),
    enabled: checked.has('fleet'),
  });
  const issueQ = useQuery({
    queryKey: ['records', 'issue', 'all', from, to],
    queryFn: () => api<Issue[]>('GET', `/records/issue?from=${from}&to=${to}`),
    enabled: needsIssue,
  });

  const configQ = useQuery({ queryKey: ['exports-config'], queryFn: () => api<ExportConfig>('GET', '/exports/config') });

  // ---- per-section readiness + row-count preview ----
  // `settled(q)` = has data AND isn't mid-refetch — required because WO-6's
  // keepPreviousData means `.data` can be the PREVIOUS window's rows while the
  // current window is still loading (see attendanceReady above).
  const settled = <T,>(q: { data: T | undefined; isFetching: boolean }) => q.data !== undefined && !q.isFetching;
  const SECTION_READY: Record<SectionKey, boolean> = {
    expense: !checked.has('expense') || settled(expensesQ),
    money: !checked.has('money') || (settled(cashTransfersQ) && settled(ledgerRollupQ)),
    vendor: !checked.has('vendor') || (vendorsQ.data !== undefined && vendorLedgersReady),
    attendance: !checked.has('attendance') || attendanceReady,
    progress: !checked.has('progress') || settled(progressQ),
    siteSummary:
      !checked.has('siteSummary') ||
      (attendanceReady && settled(expensesQ) && settled(progressQ) && settled(issueQ) && settled(fuelQ)),
    material: !checked.has('material') || settled(materialQ),
    fleet: !checked.has('fleet') || (settled(fuelQ) && settled(vehicleLogQ) && settled(tripQ)),
    issue: !checked.has('issue') || settled(issueQ),
    people: !checked.has('people') || (!!peopleQ.data && !!usersQ.data),
  };
  const SECTION_ROWS: Partial<Record<SectionKey, number>> = {
    expense: expensesQ.data?.length,
    money: cashTransfersQ.data?.length,
    vendor: vendorsQ.data?.length,
    attendance: attendanceReady ? attendance.length : undefined,
    progress: progressQ.data?.length,
    siteSummary: sites.length,
    material: materialQ.data?.length,
    fleet: [fuelQ.data, vehicleLogQ.data, tripQ.data].every((d) => d) ? (fuelQ.data!.length + vehicleLogQ.data!.length + tripQ.data!.length) : undefined,
    issue: issueQ.data?.length,
    people: peopleQ.data?.length,
  };

  const lookupsError = meQ.error ?? sitesQ.error ?? usersQ.error ?? peopleQ.error ?? vehiclesQ.error ?? null;
  const sectionErrors = Array.from(checked)
    .map((s): unknown => {
      switch (s) {
        case 'expense':
          return expensesQ.error;
        case 'money':
          return cashTransfersQ.error ?? ledgerRollupQ.error;
        case 'vendor':
          return vendorsQ.error ?? vendorLedgerQs.find((q) => q.error)?.error;
        case 'attendance':
          return attQs.find((q) => q.error)?.error;
        case 'progress':
          return progressQ.error;
        case 'siteSummary':
          return expensesQ.error ?? progressQ.error ?? issueQ.error ?? fuelQ.error;
        case 'material':
          return materialQ.error;
        case 'fleet':
          return fuelQ.error ?? vehicleLogQ.error ?? tripQ.error;
        case 'issue':
          return issueQ.error;
        case 'people':
          return null;
      }
    })
    .find(Boolean);
  const error = lookupsError ?? sectionErrors ?? null;

  const allReady = !error && Array.from(checked).every((s) => SECTION_READY[s]);
  const anyChecked = checked.size > 0;
  const fileName = meQ.data ? exportFileName(meQ.data.org.code, from, to) : null;
  const longWindow = daysBetween(from, to) > 31;

  const retryAll = () => {
    void meQ.refetch();
    void sitesQ.refetch();
    void usersQ.refetch();
    void peopleQ.refetch();
    void vehiclesQ.refetch();
    if (needsExpense) void expensesQ.refetch();
    attQs.forEach((q) => void q.refetch());
    if (checked.has('money')) {
      void cashTransfersQ.refetch();
      void ledgerRollupQ.refetch();
    }
    if (needsVendorLookup) void vendorsQ.refetch();
    vendorLedgerQs.forEach((q) => void q.refetch());
    if (needsProgress) void progressQ.refetch();
    if (checked.has('material')) void materialQ.refetch();
    if (needsFuel) void fuelQ.refetch();
    if (checked.has('fleet')) {
      void vehicleLogQ.refetch();
      void tripQ.refetch();
    }
    if (needsIssue) void issueQ.refetch();
  };

  function buildSelectedSheets(): { sheets: SheetSpec[]; summaries: SectionSummary[] } {
    const sheets: SheetSpec[] = [];
    const summaries: SectionSummary[] = [];
    const users = usersQ.data ?? [];
    const people = peopleQ.data ?? [];
    const vehicles = vehiclesQ.data ?? [];
    const vendors = vendorsQ.data ?? [];

    if (checked.has('expense')) {
      const data = expensesQ.data ?? [];
      sheets.push(buildExpenseSheet(data, sites, vendors, users, m));
      summaries.push({
        label: sectionLabel(m, 'expense'),
        rowCount: data.length,
        totalPaise: data.filter((e) => !e.void).reduce((sum, e) => sum + e.amountPaise, 0),
      });
    }
    if (checked.has('money')) {
      const transfers = cashTransfersQ.data ?? [];
      const rollup = ledgerRollupQ.data ?? [];
      sheets.push(buildCashTransferSheet(transfers, users, m));
      sheets.push(buildLedgerRollupSheet(rollup, m));
      summaries.push({
        label: sectionLabel(m, 'money'),
        rowCount: transfers.length,
        totalPaise: transfers.reduce((sum, t) => sum + t.amountPaise, 0),
      });
    }
    if (checked.has('vendor')) {
      sheets.push(buildVendorSheet(vendors, vendorLedgers, sites, m));
      sheets.push(buildVendorMonthsSheet(vendors, vendorLedgers, m));
      summaries.push({ label: sectionLabel(m, 'vendor'), rowCount: vendors.length });
    }
    if (checked.has('attendance')) {
      sheets.push(buildAttendanceSheet(attendance, sites, people, users, m));
      summaries.push({ label: sectionLabel(m, 'attendance'), rowCount: attendance.length });
    }
    if (checked.has('progress')) {
      const data = progressQ.data ?? [];
      sheets.push(buildProgressSheet(data, sites, users, m));
      summaries.push({ label: sectionLabel(m, 'progress'), rowCount: data.length });
    }
    if (checked.has('siteSummary')) {
      sheets.push(
        buildSiteSummarySheet(
          {
            sites,
            attendance,
            expenses: expensesQ.data ?? [],
            fuel: fuelQ.data ?? [],
            vehicles,
            progress: progressQ.data ?? [],
            issues: issueQ.data ?? [],
          },
          m,
        ),
      );
      summaries.push({ label: sectionLabel(m, 'siteSummary'), rowCount: sites.length });
    }
    if (checked.has('material')) {
      const data = materialQ.data ?? [];
      sheets.push(buildMaterialSheet(data, sites, m));
      summaries.push({ label: sectionLabel(m, 'material'), rowCount: data.length });
    }
    if (checked.has('fleet')) {
      const fuel = fuelQ.data ?? [];
      const vlogs = vehicleLogQ.data ?? [];
      const trips = tripQ.data ?? [];
      sheets.push(buildFuelSheet(fuel, vehicles, m));
      sheets.push(buildVehicleLogSheet(vlogs, vehicles, people, m));
      sheets.push(buildTripSheet(trips, vehicles, m));
      summaries.push({
        label: sectionLabel(m, 'fleet'),
        rowCount: fuel.length + vlogs.length + trips.length,
        totalPaise: fuel.reduce((sum, f) => sum + (f.amountPaise ?? 0), 0),
      });
    }
    if (checked.has('issue')) {
      const data = issueQ.data ?? [];
      sheets.push(buildIssueSheet(data, sites, vehicles, m));
      summaries.push({ label: sectionLabel(m, 'issue'), rowCount: data.length });
    }
    if (checked.has('people')) {
      sheets.push(buildPeopleSheet(people, users, sites, m));
      summaries.push({ label: sectionLabel(m, 'people'), rowCount: people.length });
    }
    return { sheets, summaries };
  }

  const download = async () => {
    if (!allReady || !fileName || !meQ.data) return;
    const { sheets, summaries } = buildSelectedSheets();
    const summarySheet = buildSummarySheet(
      {
        orgName: meQ.data.org.name,
        from,
        to,
        generatedAt: formatKolkataDateTime(new Date().toISOString()),
        requestedBy: meQ.data.user.name,
        sections: summaries,
      },
      m,
    );
    const wb = await buildWorkbook([summarySheet, ...sheets]);
    await downloadWorkbook(wb, fileName);
    setDownloaded(true);
  };

  const sendEmail = async () => {
    if (!EMAIL_RE.test(email) || !allReady) return;
    setEmailStatus('sending');
    try {
      await api('POST', '/exports/email', { sections: Array.from(checked), from, to, email, locale });
      setEmailStatus('sent');
    } catch {
      setEmailStatus('error');
    }
  };

  return (
    <Card data-testid="reports-screen">
      <CardHeader>
        <CardTitle>{m.OWNER_UI.reportsTitle}</CardTitle>
        <CardDescription>{m.OWNER_UI.reportsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <WindowToggle options={windowOptions(m)} value={win} onChange={setWin} testIdPrefix="report-window" />
          {win === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <DateField id="report-from" value={customFrom} onChange={setCustomFrom} max={today} testId="report-from" />
              <DateField id="report-to" value={customTo} onChange={setCustomTo} min={customFrom} max={today} testId="report-to" />
            </div>
          )}
        </div>

        <div className="grid gap-3" data-testid="report-sections">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{m.EXPORT_UI.sectionsTitle}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline"
                data-testid="report-select-all"
                onClick={() => setChecked(new Set(GROUPS.flatMap((g) => g.sections)))}
              >
                {m.EXPORT_UI.selectAll}
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                data-testid="report-clear-all"
                onClick={() => setChecked(new Set())}
              >
                {m.EXPORT_UI.clearAll}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{m.EXPORT_UI.sectionsHint}</p>

          {GROUPS.map(({ group, sections }) => (
            <div key={group} className="grid gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{groupLabel(m, group)}</p>
              <ul className="grid gap-1.5">
                {sections.map((s) => {
                  const rows = SECTION_ROWS[s];
                  return (
                    <li key={s} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`section-${s}`}
                        checked={checked.has(s)}
                        onCheckedChange={() => toggleSection(s)}
                        data-testid={`section-${s}`}
                      />
                      <Label htmlFor={`section-${s}`} className="flex-1 cursor-pointer text-sm font-normal">
                        {sectionLabel(m, s)}
                      </Label>
                      {checked.has(s) && (
                        <span className="text-xs tabular-nums text-muted-foreground" data-testid={`section-${s}-count`}>
                          {rows === undefined ? '…' : `${rows} ${m.EXPORT_UI.rowsCountSuffix}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={retryAll} />
        ) : !allReady && anyChecked ? (
          <LoadingState label={m.OWNER_UI.reportsPreparing} />
        ) : null}

        {configQ.data?.emailEnabled && (
          <div className="grid gap-2" data-testid="report-delivery">
            <p className="text-sm font-medium">{m.EXPORT_UI.deliveryTitle}</p>
            <WindowToggle
              options={[
                { value: 'download', label: m.EXPORT_UI.deliveryDownload },
                { value: 'email', label: m.EXPORT_UI.deliveryEmail },
              ]}
              value={delivery}
              onChange={setDelivery}
              testIdPrefix="report-delivery"
            />
            {longWindow && (
              <Notice tone="warning" testId="report-long-window-hint">
                {m.EXPORT_UI.emailHintLongWindow}
              </Notice>
            )}
            {delivery === 'email' && (
              <div className="grid gap-1">
                <Label htmlFor="report-email">{m.EXPORT_UI.emailLabel}</Label>
                <Input
                  id="report-email"
                  type="email"
                  data-testid="report-email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="owner@example.com"
                />
                {email.length > 0 && !EMAIL_RE.test(email) && (
                  <p className="text-xs text-destructive">{m.EXPORT_UI.emailInvalid}</p>
                )}
              </div>
            )}
          </div>
        )}

        {fileName && (
          <p className="text-xs text-muted-foreground">
            {m.OWNER_UI.reportsFileLabel}: <span className="font-mono" data-testid="report-file-name">{fileName}</span>
          </p>
        )}

        {downloaded && (
          <Notice tone="success" testId="report-downloaded">
            {m.OWNER_UI.reportsDone}
          </Notice>
        )}
        {emailStatus === 'sent' && (
          <Notice tone="success" testId="report-email-sent">
            {m.EXPORT_UI.emailAccepted}
          </Notice>
        )}
        {emailStatus === 'error' && <ErrorState error={new Error('email-send-failed')} onRetry={() => void sendEmail()} />}

        {delivery === 'download' || !configQ.data?.emailEnabled ? (
          <Button type="button" data-testid="report-download" disabled={!allReady || !anyChecked} onClick={() => void download()}>
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {m.OWNER_UI.reportsDownload}
          </Button>
        ) : (
          <Button
            type="button"
            data-testid="report-send-email"
            disabled={!allReady || !anyChecked || !EMAIL_RE.test(email) || emailStatus === 'sending'}
            onClick={() => void sendEmail()}
          >
            <Mail className={cn('size-4', emailStatus === 'sending' && 'animate-pulse')} aria-hidden="true" />
            {emailStatus === 'sending' ? m.EXPORT_UI.emailSending : m.EXPORT_UI.emailSend}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
