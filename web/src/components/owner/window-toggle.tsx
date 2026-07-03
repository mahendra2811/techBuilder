'use client';

/** Segmented date-window toggle (Today / 7 days / 30 days …) — same visual
 * pattern as the records-screen tablist. Generic over the option value type. */
import { cn } from '@/lib/utils';

export interface WindowOption<T extends string> {
  value: T;
  label: string;
}

export function WindowToggle<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: ReadonlyArray<WindowOption<T>>;
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          data-testid={`${testIdPrefix}-${o.value}`}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
