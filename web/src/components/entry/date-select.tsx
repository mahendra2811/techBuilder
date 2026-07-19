'use client';

/**
 * Business-date picker as a DROPDOWN of exactly the days the caller is allowed to file for —
 * today plus `backdateDays` days back — instead of a free calendar. A calendar let a user land
 * on a date outside their role's backdating window, which the server then rejected with a
 * "date window" error; listing only the valid days makes that impossible by construction.
 *
 * `backdateDays` MUST equal the backend window for this role/record (see backdateDaysFor in
 * lib/business-date.ts). Value/onChange stay ISO `YYYY-MM-DD` — the form/API contract is unchanged.
 * Labels: "Today (19 Jul 2026)", "Yesterday (18 Jul 2026)", then "17 Jul 2026", …
 */
import { useMemo } from 'react';
import type { BusinessDate } from '@techbuilder/contracts';
import { addDays } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

/** "19 Jul 2026" — day + short month + year (UTC, since business dates are calendar strings). */
function labelDate(d: BusinessDate): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${d}T00:00:00Z`),
  );
}

export function DateSelect({
  id,
  testId,
  value,
  onChange,
  today,
  backdateDays,
}: {
  id: string;
  testId: string;
  value: BusinessDate;
  onChange: (date: BusinessDate) => void;
  today: BusinessDate;
  /** Days the role may go back (0 = today only, 1 = today+yesterday, …). Clamped ≥ 0. */
  backdateDays: number;
}) {
  const m = useMessages();
  const options = useMemo(
    () => Array.from({ length: Math.max(0, backdateDays) + 1 }, (_, i) => addDays(today, -i)),
    [today, backdateDays],
  );
  const optionLabel = (d: BusinessDate, i: number): string => {
    if (i === 0) return `${m.ENTRY_UI.dateToday} (${labelDate(d)})`;
    if (i === 1) return `${m.ENTRY_UI.dateYesterday} (${labelDate(d)})`;
    return labelDate(d);
  };
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{m.ENTRY_UI.date}</Label>
      <NativeSelect id={id} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((d, i) => (
          <option key={d} value={d}>
            {optionLabel(d, i)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
