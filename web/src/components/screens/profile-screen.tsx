'use client';

/**
 * Cross-role Profile page (frozen.9) — one screen mounted at /{role}/profile for
 * ALL 6 roles (no role prop; everything data-driven off GET /me + GET /sites +
 * GET /people). Sections:
 *   a. Personal details — name, role badge, username, assigned site, mobile.
 *   b. Guardian / emergency contact — rendered ONLY when the caller has a linked
 *      labour-master person. Found by matching GET /people against
 *      me().user.personId (NOT index [0] — unlike the worker dashboard's
 *      self-scoped list, OWNER/SITE_MANAGER/SUPERVISOR see their whole
 *      roster/crew here). Read-only once set; a one-time self-add form
 *      (PATCH /me/guardian) while both fields are still empty.
 *   c. Money I've taken — ALWAYS visible (unlike the collapsed dashboard card):
 *      GET /me/money rendered via the shared presentational <MoneyTakenList />
 *      (also reused by the upper-role view on person-insights-screen.tsx).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { MyMoney, Person, SetGuardianInput, Site } from '@techbuilder/contracts';
import { api, me } from '@/lib/api-client';
import { apiErrorOf } from '@/lib/i18n/messages';
import { useLocale, useMessages } from '@/lib/i18n/locale-context';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState, ErrorState, Notice } from '@/components/entry/states';
import { MoneyTakenList } from '@/components/my-money-card';

const UI = {
  en: {
    detailsTitle: 'My details',
    username: 'Username',
    site: 'Site',
    mobile: 'Mobile',
    noMobile: 'Not set',
    guardianTitle: 'Guardian / emergency contact',
    guardianName: 'Guardian name',
    guardianPhone: 'Guardian mobile',
    guardianHint: 'To change these, ask your Site Manager',
    guardianOnceCaption: 'You can set this only once — after saving, only your Site Manager or Owner can change it.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Guardian details saved',
    moneyTitle: "Money I've taken",
    refresh: 'Refresh',
  },
  hi: {
    detailsTitle: 'मेरी जानकारी',
    username: 'यूज़रनेम',
    site: 'साइट',
    mobile: 'मोबाइल',
    noMobile: 'सेट नहीं है',
    guardianTitle: 'अभिभावक / आपातकालीन संपर्क',
    guardianName: 'अभिभावक का नाम',
    guardianPhone: 'अभिभावक का मोबाइल',
    guardianHint: 'बदलने के लिए साइट मैनेजर से कहें',
    guardianOnceCaption: 'इसे केवल एक बार सेट किया जा सकता है — सहेजने के बाद इसे केवल आपके साइट मैनेजर या मालिक ही बदल सकते हैं।',
    save: 'सहेजें',
    saving: 'सहेजा जा रहा है…',
    saved: 'अभिभावक जानकारी सहेजी गई',
    moneyTitle: 'मैंने लिया पैसा',
    refresh: 'रीफ़्रेश करें',
  },
} as const;
type Ui = { [K in keyof typeof UI.en]: string };

const EM_DASH = '—';

export function ProfileScreen() {
  const m = useMessages();
  const locale = useLocale();
  const ui = UI[locale];

  const meQ = useQuery({ queryKey: ['me'], queryFn: me });
  const sitesQ = useQuery({ queryKey: ['sites'], queryFn: () => api<Site[]>('GET', '/sites') });
  const peopleQ = useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('GET', '/people') });
  const moneyQ = useQuery({ queryKey: ['my-money'], queryFn: () => api<MyMoney>('GET', '/me/money') });

  const user = meQ.data?.user;
  const site = sitesQ.data?.find((s) => s.id === user?.assignedSiteId);
  // The caller's own labour-master row (if any) — matched by personId, NOT
  // assumed to be the first list entry (SM/Supervisor/Owner see their whole
  // roster/crew from GET /people, not just themselves).
  const person = user?.personId ? peopleQ.data?.find((p) => p.id === user.personId) : undefined;
  const phone = user?.phone || person?.phone || null;

  return (
    <div className="grid gap-4" data-testid="profile-screen">
      <Card data-testid="profile-details">
        <CardHeader>
          <CardTitle>{ui.detailsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-h-24 content-start gap-1.5">
          {meQ.isPending ? (
            <LoadingState />
          ) : meQ.error ? (
            <ErrorState error={meQ.error} onRetry={() => void meQ.refetch()} />
          ) : user ? (
            <>
              <p className="text-lg font-semibold" data-testid="profile-name">
                {user.name}
              </p>
              <span
                className="inline-block w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                data-testid="profile-role"
              >
                {m.ROLE_LABELS[user.role]}
              </span>
              <p className="text-sm text-muted-foreground" data-testid="profile-username">
                {ui.username}: {user.username}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="profile-site">
                {ui.site}: {sitesQ.isPending ? EM_DASH : (site ? `${site.name} (${site.code})` : EM_DASH)}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="profile-mobile">
                {ui.mobile}: {phone ?? ui.noMobile}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {peopleQ.error ? (
        <Card data-testid="profile-guardian">
          <CardHeader>
            <CardTitle>{ui.guardianTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorState error={peopleQ.error} onRetry={() => void peopleQ.refetch()} />
          </CardContent>
        </Card>
      ) : person ? (
        <GuardianSection person={person} ui={ui} />
      ) : null}

      <Card data-testid="profile-money">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>{ui.moneyTitle}</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="profile-money-refresh"
            aria-label={ui.refresh}
            disabled={moneyQ.isFetching}
            onClick={() => void moneyQ.refetch()}
          >
            <RefreshCw className={cn('size-4', moneyQ.isFetching && 'animate-spin')} aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="grid min-h-16 content-start gap-3">
          {moneyQ.isPending ? (
            <LoadingState />
          ) : moneyQ.error ? (
            <ErrorState error={moneyQ.error} onRetry={() => void moneyQ.refetch()} />
          ) : (
            <MoneyTakenList money={moneyQ.data as MyMoney} locale={locale} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guardian / emergency contact — read-only once set, one-time self-add form
// while both fields are empty (server re-enforces set-once on PATCH /me/guardian).
// ---------------------------------------------------------------------------

function GuardianSection({ person, ui }: { person: Person; ui: Ui }) {
  const m = useMessages();
  const queryClient = useQueryClient();
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [saved, setSaved] = useState(false);

  const hasGuardian = !!(person.guardianName || person.guardianPhone);

  const save = useMutation({
    mutationFn: (input: SetGuardianInput) => api<Person>('PATCH', '/me/guardian', input),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
    },
  });

  const serverError =
    apiErrorOf(m, save.error);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    save.mutate({ guardianName: guardianName.trim(), guardianPhone: guardianPhone.trim() });
  };

  return (
    <Card data-testid="profile-guardian">
      <CardHeader>
        <CardTitle>{ui.guardianTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {hasGuardian ? (
          <>
            <p className="text-sm" data-testid="profile-guardian-name">
              {ui.guardianName}: {person.guardianName}
            </p>
            <p className="text-sm" data-testid="profile-guardian-phone">
              {ui.guardianPhone}: {person.guardianPhone}
            </p>
            <p className="text-xs text-muted-foreground">{ui.guardianHint}</p>
          </>
        ) : (
          <form className="grid gap-3" noValidate onSubmit={onSubmit} data-testid="profile-guardian-form">
            <p className="text-xs text-muted-foreground">{ui.guardianOnceCaption}</p>
            <div className="grid gap-2">
              <Label htmlFor="profile-guardian-name-input">{ui.guardianName}</Label>
              <Input
                id="profile-guardian-name-input"
                data-testid="profile-guardian-name-input"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-guardian-phone-input">{ui.guardianPhone}</Label>
              <Input
                id="profile-guardian-phone-input"
                type="tel"
                inputMode="tel"
                data-testid="profile-guardian-phone-input"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                required
              />
            </div>
            {serverError && (
              <Notice tone="error" testId="profile-guardian-error">
                {serverError}
              </Notice>
            )}
            {saved && (
              <Notice tone="success" testId="profile-guardian-success">
                {ui.saved}
              </Notice>
            )}
            <Button
              type="submit"
              size="sm"
              data-testid="profile-guardian-save"
              disabled={save.isPending || !guardianName.trim() || !guardianPhone.trim()}
            >
              {save.isPending ? ui.saving : ui.save}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
