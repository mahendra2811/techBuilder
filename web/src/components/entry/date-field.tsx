'use client';

/**
 * Business-date picker: native <input type="date"> (mobile OS calendar),
 * max = today (no future entries) and min = the role's backdating window.
 * The server stays authoritative — out-of-window picks still error cleanly.
 */
import type { BusinessDate } from '@techbuilder/contracts';
import { ENTRY_UI } from '@/lib/messages';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  testId,
}: {
  id: string;
  value: BusinessDate;
  onChange: (date: BusinessDate) => void;
  min?: BusinessDate;
  max: BusinessDate;
  testId: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{ENTRY_UI.date}</Label>
      <Input
        id={id}
        type="date"
        data-testid={testId}
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}
