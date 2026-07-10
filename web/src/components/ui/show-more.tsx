'use client';

/**
 * WO-11 (wave 2): client-side "show more" for lists that can grow long — the
 * data is already fetched (this is a render fix, not a fetch fix); only the
 * first `initial` items render until tapped. NOT a substitute for real
 * pagination on a genuinely unbounded server read (only `cash-transfers` is
 * capped server-side today) — this is for lists whose full data is already
 * in memory and just shouldn't all paint at once.
 *
 * Owns its own wrapper element (`as` — "ul" or "div") so the "show more"
 * button always renders as a sibling AFTER the wrapper, never as an invalid
 * direct child of a `<ul>`.
 */
import { useState } from 'react';
import { useMessages } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';

export function ShowMore<T>({
  items,
  initial = 7,
  step,
  renderItem,
  testIdPrefix = 'show-more',
  as = 'div',
  className,
}: {
  items: T[];
  /** How many items render before the first tap. @default 7 */
  initial?: number;
  /** How many more each tap reveals. @default `initial` */
  step?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  testIdPrefix?: string;
  /** Wrapper element for the items — "ul" for `<li>` renderItems, "div" otherwise. @default "div" */
  as?: 'ul' | 'div';
  /** className for the wrapper element (e.g. "divide-y" for a ul). */
  className?: string;
}) {
  const m = useMessages();
  const [visible, setVisible] = useState(initial);
  const shown = items.slice(0, visible);
  const remaining = items.length - visible;
  const Wrapper = as;

  return (
    <div className="grid gap-3">
      <Wrapper className={className}>{shown.map((item, idx) => renderItem(item, idx))}</Wrapper>
      {remaining > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          data-testid={`${testIdPrefix}-more`}
          onClick={() => setVisible((v) => v + (step ?? initial))}
        >
          {m.ENTRY_UI.showMore} ({remaining})
        </Button>
      )}
    </div>
  );
}
