'use client';

/**
 * Settings (/owner/settings — Owner only, `config.manage`).
 *
 * READ-ONLY viewer of the org's OrgConfig (from GET /me — the session already
 * carries the parsed, zod-validated config). There is NO org-config update
 * endpoint yet (confirmed backend gap — see the batch report), so this screen
 * only displays; a clear localized note says so.
 */
import { useQuery } from '@tanstack/react-query';
import type { OrgConfig } from '@techbuilder/contracts';
import { me } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState, ErrorState, EmptyState, Notice } from '@/components/entry/states';

/** Mirrors shared/src/config.ts OrgConfigSchema.features — keep in sync if that shape changes. */
const FEATURE_KEYS = [
  'voiceNotes',
  'kioskMode',
  'fuelReconciliation',
  'materialReconciliation',
  'wageSummary',
  'whatsappShare',
  'pdfExport',
  'docExpiryAlerts',
  'qrScan',
  'gpsGeotag',
] as const satisfies ReadonlyArray<keyof OrgConfig['features']>;

export function SettingsScreen() {
  const m = useMessages();
  const meQ = useQuery({ queryKey: ['me'], queryFn: me });

  return (
    <div className="grid gap-4" data-testid="settings-view">
      <Card>
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.title}</CardTitle>
          <CardDescription>{m.SETTINGS_UI.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <Notice tone="warning" testId="settings-readonly-note">
            {m.SETTINGS_UI.readOnlyNote}
          </Notice>
        </CardContent>
      </Card>

      {meQ.isPending ? (
        <Card>
          <CardContent>
            <LoadingState />
          </CardContent>
        </Card>
      ) : meQ.error ? (
        <Card>
          <CardContent>
            <ErrorState error={meQ.error} onRetry={() => void meQ.refetch()} />
          </CardContent>
        </Card>
      ) : meQ.data ? (
        <ConfigView config={meQ.data.org.config} />
      ) : null}
    </div>
  );
}

function ConfigView({ config }: { config: OrgConfig }) {
  const m = useMessages();
  return (
    <>
      <Card data-testid="settings-brand">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.brandTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Row label={m.SETTINGS_UI.brandName} value={config.brand.name} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{m.SETTINGS_UI.brandColor}</span>
            <span className="flex items-center gap-2">
              <span
                className="size-5 shrink-0 rounded-full ring-1 ring-foreground/10"
                style={{ backgroundColor: config.brand.primaryColor }}
                aria-hidden="true"
              />
              <span className="font-mono text-xs">{config.brand.primaryColor}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="settings-locale">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.localeTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Row label={m.SETTINGS_UI.localeDefault} value={m.LOCALE_LABELS[config.locale.default]} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{m.SETTINGS_UI.localeEnabled}</span>
            <PillGroup items={config.locale.enabled.map((l) => m.LOCALE_LABELS[l])} />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="settings-roles">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.rolesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <PillGroup items={config.roles.enabled.map((r) => m.ROLE_LABELS[r])} />
        </CardContent>
      </Card>

      <Card data-testid="settings-records">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.recordsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <PillGroup items={config.records.enabled.map((r) => m.RECORD_TYPE_LABELS[r])} />
        </CardContent>
      </Card>

      <Card data-testid="settings-features">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.featuresTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEATURE_KEYS.map((key) => {
              const on = config.features[key];
              return (
                <li key={key} className="flex items-center justify-between gap-2 rounded-lg border border-input px-2.5 py-1.5" data-testid={`feature-${key}`}>
                  <span className="min-w-0 truncate text-xs">{m.FEATURE_FLAG_LABELS[key]}</span>
                  <span
                    className={
                      on
                        ? 'shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400'
                        : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'
                    }
                  >
                    {on ? m.SETTINGS_UI.featureOn : m.SETTINGS_UI.featureOff}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="settings-wage">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.wageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Row label={m.SETTINGS_UI.wageModel} value={config.wage.model === 'daily' ? m.SETTINGS_UI.wageModelDaily : config.wage.model} />
          <Row label={m.SETTINGS_UI.otMultiplier} value={`× ${config.wage.otMultiplier}`} />
        </CardContent>
      </Card>

      <Card data-testid="settings-vehicle-types">
        <CardHeader>
          <CardTitle>{m.SETTINGS_UI.vehicleTypesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {config.vehicleTypes.length === 0 ? (
            <EmptyState label={m.SETTINGS_UI.vehicleTypesEmpty} />
          ) : (
            <ul className="divide-y">
              {config.vehicleTypes.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm">{t.labelEn}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {m.VEHICLE_TRACKING_MODE_LABELS[t.trackingMode]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function PillGroup({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {item}
        </span>
      ))}
    </div>
  );
}
