'use client';

/**
 * Excel export (/owner/reports) — window picker (7/30 days) + one client-side
 * "Download Excel" (SheetJS, no server round-trip). Two sheets:
 *   Attendance: Date | Site | Person | Status | OT hours | Marked by | Corrected
 *   Expenses:   Date | Site | Category | Amount ₹ | Bill no | Entered by | Voided | Corrected
 * Attendance requires siteId → fetched per site across the window; expenses come
 * unfiltered (owner sees all sites). Sheet building is pure (lib/export-excel).
 */
import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import type { Attendance, Expense, Person, Site, User } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { addDays, todayKolkata } from '@/lib/business-date';
import { attendanceSheetRows, buildWorkbook, expenseSheetRows, exportFileName } from '@/lib/export-excel';
import { useMessages } from '@/lib/i18n/locale-context';
import type { Messages } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WindowToggle } from '@/components/owner/window-toggle';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';

type ReportWindow = '7d' | '30d';

const windowOptions = (o: Messages['OWNER_UI']) =>
  [
    { value: '7d', label: o.window7d },
    { value: '30d', label: o.window30d },
  ] as const;

export function ReportsScreen() {
  const m = useMessages();
  const today = useMemo(() => todayKolkata(), []);
  const [win, setWin] = useState<ReportWindow>('7d');
  const [downloaded, setDownloaded] = useState(false);
  const from = addDays(today, win === '7d' ? -6 : -29);

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('GET', '/users') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const expensesQ = useQuery({
    queryKey: ['records', 'expense', 'all', from, today],
    queryFn: () => api<Expense[]>('GET', `/records/expense?from=${from}&to=${today}`),
  });
  const sites = sitesQ.data ?? [];
  const attQs = useQueries({
    queries: sites.map((s) => ({
      queryKey: ['attendance', s.id, from, today],
      queryFn: () => api<Attendance[]>('GET', `/attendance?siteId=${s.id}&from=${from}&to=${today}`),
    })),
  });

  const queries = [meQ, sitesQ, usersQ, peopleQ, expensesQ, ...attQs];
  const error = queries.find((q) => q.error)?.error ?? null;
  const loading = !error && (queries.some((q) => q.isPending) || !sitesQ.data);

  const attendance: Attendance[] | null =
    sitesQ.data && attQs.length === sitesQ.data.length && attQs.every((q) => q.data !== undefined)
      ? attQs.flatMap((q) => q.data ?? [])
      : null;
  const ready = !error && !loading && attendance !== null && !!expensesQ.data && !!meQ.data;

  const fileName = meQ.data ? exportFileName(meQ.data.org.code, from, today) : null;

  const download = async () => {
    if (!ready || !attendance || !fileName) return;
    const wb = await buildWorkbook(
      attendanceSheetRows(attendance, sites, peopleQ.data ?? [], usersQ.data ?? [], m),
      expenseSheetRows(expensesQ.data ?? [], sites, usersQ.data ?? [], m),
      m,
    );
    // SheetJS is lazy-loaded (see lib/export-excel.ts) so it leaves this route's bundle.
    const XLSX = await import('xlsx');
    XLSX.writeFile(wb, fileName);
    setDownloaded(true);
  };

  return (
    <Card data-testid="reports-screen">
      <CardHeader>
        <CardTitle>{m.OWNER_UI.reportsTitle}</CardTitle>
        <CardDescription>{m.OWNER_UI.reportsSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <WindowToggle
          options={windowOptions(m.OWNER_UI)}
          value={win}
          onChange={(w) => {
            setDownloaded(false);
            setWin(w);
          }}
          testIdPrefix="report-window"
        />

        {error ? (
          <ErrorState error={error} onRetry={() => queries.forEach((q) => void q.refetch())} />
        ) : loading || attendance === null ? (
          <LoadingState label={m.OWNER_UI.reportsPreparing} />
        ) : (
          <dl className="grid gap-1 text-sm" data-testid="report-preview">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {m.OWNER_UI.reportsPreviewAttendance} ({m.OWNER_UI.sheetAttendance})
              </dt>
              <dd className="font-medium tabular-nums" data-testid="report-count-attendance">
                {attendance.length}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {m.OWNER_UI.reportsPreviewExpenses} ({m.OWNER_UI.sheetExpenses})
              </dt>
              <dd className="font-medium tabular-nums" data-testid="report-count-expenses">
                {expensesQ.data?.length ?? 0}
              </dd>
            </div>
            {fileName && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{m.OWNER_UI.reportsFileLabel}</dt>
                <dd className="min-w-0 truncate font-mono text-xs" data-testid="report-file-name">
                  {fileName}
                </dd>
              </div>
            )}
          </dl>
        )}

        {downloaded && (
          <Notice tone="success" testId="report-downloaded">
            {m.OWNER_UI.reportsDone}
          </Notice>
        )}

        <Button type="button" data-testid="report-download" disabled={!ready} onClick={() => void download()}>
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          {m.OWNER_UI.reportsDownload}
        </Button>
      </CardContent>
    </Card>
  );
}
