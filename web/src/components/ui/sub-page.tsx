'use client';

/**
 * Shared "in-page sub-page" primitive — the list ↔ detail split the client
 * loves (see `screens/vendors-screen.tsx` `VendorList`/`VendorDetail`): the
 * URL never changes, a screen just swaps its own body between a list view and
 * a detail view based on local state, with a back button to return.
 *
 * Usage (vendors-style):
 * ```tsx
 * function MyScreen() {
 *   const { current, open, close } = useSubPage<MyRow>();
 *   return current ? (
 *     <div className="grid gap-4" data-testid="my-detail">
 *       <SubPageHeader title={current.name} onBack={close} />
 *       {...detail content...}
 *     </div>
 *   ) : (
 *     <MyList onSelect={open} />
 *   );
 * }
 * ```
 */
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';
import { Button } from '@/components/ui/button';

const UI = {
  en: { back: 'Back' },
  hi: { back: 'वापस' },
} as const;

/** Top bar for a sub-page detail view: a back button + the detail's title. */
export function SubPageHeader({
  title,
  onBack,
  backLabel,
}: {
  title: React.ReactNode;
  onBack: () => void;
  /** @default 'Back' / 'वापस' (locale-aware) */
  backLabel?: string;
}) {
  const locale = useLocale();
  const label = backLabel ?? UI[locale].back;
  return (
    <div className="flex items-center gap-3" data-testid="subpage-header">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit shrink-0"
        data-testid="subpage-back"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
    </div>
  );
}

/** Tiny state hook backing the list↔detail split: `current` is `null` in list view. */
export function useSubPage<T>() {
  const [current, setCurrent] = useState<T | null>(null);
  return {
    current,
    open: (v: T) => setCurrent(v),
    close: () => setCurrent(null),
  };
}
