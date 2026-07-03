'use client';

/**
 * Site selection for entry forms. Lists come pre-scoped from the backend
 * (SM = their sites, TH = their one site), so: exactly one site renders as a
 * fixed read-only row; multiple render a native select.
 */
import type { Site, UUID } from '@techbuilder/contracts';
import { ENTRY_UI } from '@/lib/messages';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { LoadingState, EmptyState } from './states';

export function SitePicker({
  sites,
  isLoading,
  value,
  onChange,
}: {
  sites: Site[] | undefined;
  isLoading: boolean;
  value: UUID | '';
  onChange: (siteId: UUID) => void;
}) {
  if (isLoading) return <LoadingState />;
  if (!sites || sites.length === 0) return <EmptyState label={ENTRY_UI.noSites} />;

  const single = sites.length === 1 ? sites[0] : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor="site-picker">{ENTRY_UI.site}</Label>
      {single ? (
        <p
          id="site-picker"
          data-testid="site-picker-fixed"
          className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm"
        >
          {single.name} ({single.code})
        </p>
      ) : (
        <NativeSelect
          id="site-picker"
          data-testid="site-picker"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}
