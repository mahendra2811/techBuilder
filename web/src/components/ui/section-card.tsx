'use client';

import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * The tappable "open a sub-page" card every hub screen uses (khata, fuel,
 * people, fleet, settings, materials, my-requests…). Two visual variants,
 * matching the two shapes the screens had each been hand-rolling:
 *
 * - `card` (default): a standalone <Card>. `data-testid={testId}` goes on the
 *   Card, the button gets `${testId}-open`, an optional count chip gets
 *   `${testId}-count`.
 * - `row`: a bare bordered button meant to sit INSIDE a parent Card's list.
 *   `data-testid={testId}` goes on the button itself (no `-open` suffix) —
 *   this preserves the pre-extraction test ids of both shapes exactly.
 */
export function SectionCard({
  title,
  subtitle,
  count,
  testId,
  onOpen,
  variant = 'card',
}: {
  title: string;
  subtitle?: string;
  count?: number;
  testId: string;
  onOpen: () => void;
  variant?: 'card' | 'row';
}) {
  if (variant === 'row') {
    return (
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-input px-3.5 py-3 text-left hover:bg-accent"
        data-testid={testId}
        onClick={onOpen}
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Card data-testid={testId}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        data-testid={`${testId}-open`}
        onClick={onOpen}
      >
        <span className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </span>
        <span className="flex items-center gap-2">
          {count !== undefined && (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              data-testid={`${testId}-count`}
            >
              {count}
            </span>
          )}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
      </button>
    </Card>
  );
}
