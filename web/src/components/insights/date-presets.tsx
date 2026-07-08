'use client';

/**
 * WO-13 shared date-range picker for the insights screens: preset chips (Today /
 * Yesterday / Day before / Last 7 days / Last 30 days) + a custom single-date input.
 * A `from === to` range is "single-day mode"; anything wider is "period mode" — the
 * caller (insights-screen / person-insights-screen) decides what that means.
 */
import { addDays } from '@/lib/business-date';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DateRange {
  from: string;
  to: string;
}

export function DatePresets({
  today,
  value,
  onChange,
  testIdPrefix,
}: {
  today: string;
  value: DateRange;
  onChange: (range: DateRange) => void;
  testIdPrefix: string;
}) {
  const m = useMessages();
  const i = m.INSIGHTS_UI;

  const presets: Array<{ key: string; label: string; range: DateRange }> = [
    { key: 'today', label: i.chipToday, range: { from: today, to: today } },
    { key: 'yesterday', label: i.chipYesterday, range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { key: 'dayBefore', label: i.chipDayBefore, range: { from: addDays(today, -2), to: addDays(today, -2) } },
    { key: 'last7', label: i.chipLast7, range: { from: addDays(today, -6), to: today } },
    { key: 'last30', label: i.chipLast30, range: { from: addDays(today, -29), to: today } },
  ];
  const activeKey = presets.find((p) => p.range.from === value.from && p.range.to === value.to)?.key;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={i.title}>
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={activeKey === p.key ? 'default' : 'outline'}
            role="tab"
            aria-selected={activeKey === p.key}
            data-testid={`${testIdPrefix}-${p.key}`}
            onClick={() => onChange(p.range)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${testIdPrefix}-custom`} className="shrink-0 text-xs text-muted-foreground">
          {i.customDateLabel}
        </Label>
        <Input
          id={`${testIdPrefix}-custom`}
          type="date"
          max={today}
          className="h-8 w-fit"
          data-testid={`${testIdPrefix}-custom`}
          value={activeKey ? '' : value.from}
          onChange={(e) => {
            const d = e.target.value;
            if (d) onChange({ from: d, to: d });
          }}
        />
      </div>
    </div>
  );
}
