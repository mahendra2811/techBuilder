'use client';

/**
 * SM Fuel hub (/site-manager/fuel) — SM testing-feedback round 2, replaces the old combined
 * /site-manager/vehicle page. Landing view = 2 tappable section cards (vendors-screen /
 * khata-screen list→detail style, `useSubPage`), each its own sub-page:
 *   a. Fuel entry   — the SM's existing odometer/litres/amount/date/receipt form + recent
 *      entries list (reuses `<FuelScreen />` verbatim, no duplication — SM is this
 *      screen's only caller since the Driver got its own page in frozen.10).
 *   b. Fuel monitor — the full site-wide diesel picture: current stock, day-wise purchases,
 *      truck-wise issuances with match-status chips, and 🚩 match flags (reuses
 *      `<AccountantDieselScreen role="SITE_MANAGER" />` — the accountant's own
 *      /accountant/diesel page is untouched, this is the same component with a role prop).
 *
 * Auth + role pinning + shell come from the parent site-manager/layout.tsx. Nav: the SM's
 * nav entry (lib/nav.ts) points here labelled "Fuel" (NAV_LABELS.fuelEntry) — the client
 * explicitly wants the word "Fuel", not "Diesel"/"Vehicle".
 */
import { useLocale } from '@/lib/i18n/locale-context';
import { Card, CardContent } from '@/components/ui/card';
import { SectionCard } from '@/components/ui/section-card';
import { SubPageHeader, useSubPage } from '@/components/ui/sub-page';
import { FuelScreen } from '@/components/screens/fuel-screen';
import { AccountantDieselScreen } from '@/components/screens/accountant-diesel-screen';

type Section = 'entry' | 'monitor';

const UI = {
  en: {
    hubTitle: 'Fuel',
    hubSubtitle: 'Log fuel for your vehicles and monitor your site’s diesel stock.',
    entry: { title: 'Fuel entry', subtitle: 'Odometer, litres, amount and receipt.' },
    monitor: { title: 'Fuel monitor', subtitle: 'Stock, purchases, issuances and match flags for your site.' },
  },
  hi: {
    hubTitle: 'फ्यूल',
    hubSubtitle: 'अपनी गाड़ियों का डीज़ल दर्ज करें और साइट का पूरा डीज़ल हिसाब देखें।',
    entry: { title: 'डीज़ल एंट्री', subtitle: 'मीटर रीडिंग, लीटर, राशि और रसीद दर्ज करें।' },
    monitor: { title: 'फ्यूल निगरानी', subtitle: 'आपकी साइट का स्टॉक, खरीद, आपूर्ति और मेल-न-खाना।' },
  },
} as const;

export default function Page() {
  const locale = useLocale();
  const ui = UI[locale];
  const { current, open, close } = useSubPage<Section>();

  if (current === 'entry') {
    return (
      <div className="grid gap-4" data-testid="sm-fuel-entry-section">
        <SubPageHeader title={ui.entry.title} onBack={close} />
        <FuelScreen />
      </div>
    );
  }

  if (current === 'monitor') {
    return (
      <div className="grid gap-4" data-testid="sm-fuel-monitor-section">
        <SubPageHeader title={ui.monitor.title} onBack={close} />
        <AccountantDieselScreen role="SITE_MANAGER" />
      </div>
    );
  }

  return (
    <div className="grid gap-4" data-testid="sm-fuel-hub">
      <Card>
        <CardContent className="pt-4">
          <h1 className="text-lg font-semibold">{ui.hubTitle}</h1>
          <p className="text-sm text-muted-foreground">{ui.hubSubtitle}</p>
        </CardContent>
      </Card>

      <SectionCard
        testId="sm-fuel-section-entry"
        title={ui.entry.title}
        subtitle={ui.entry.subtitle}
        onOpen={() => open('entry')}
      />
      <SectionCard
        testId="sm-fuel-section-monitor"
        title={ui.monitor.title}
        subtitle={ui.monitor.subtitle}
        onOpen={() => open('monitor')}
      />
    </div>
  );
}

