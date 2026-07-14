'use client';

/**
 * WO-4: Emergency & contacts footer panel (worker + driver dashboards).
 *
 * Read-side only — GET /me/contacts resolves the caller's Site Manager (via
 * users.assignedSiteId → sites.siteManagerId), Supervisor (via users.crewId →
 * crews.supervisorUserId) and the site's curated emergency numbers
 * (sites.emergencyContacts jsonb).
 *
 * Every row is a large tap-to-call <a href="tel:…"> (min 44px). A contacts
 * footer must never break a dashboard: on error it renders NOTHING, and when
 * everything is empty (no SM, no Supervisor, no numbers) it renders nothing either.
 */
import type { ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ambulance, Building2, Cross, Flame, Phone, Shield, UserRound } from 'lucide-react';
import type { ContactPanel as ContactPanelData, EmergencyContactKind } from '@techbuilder/contracts';
import { api } from '@/lib/api-client';
import { useMessages } from '@/lib/i18n/locale-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/entry/states';

const KIND_ICONS: Record<EmergencyContactKind, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  POLICE: Shield,
  AMBULANCE: Ambulance,
  HOSPITAL: Cross,
  FIRE: Flame,
  SITE_OFFICE: Building2,
  OTHER: Phone,
};

/** Strip formatting so tel: gets only digits and a leading +. */
const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`;

/** One large tap-to-call row (min 44px tall for thumbs); plain row when there is no phone. */
function CallRow({
  icon: Icon,
  label,
  caption,
  phone,
  testId,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  caption?: string;
  phone: string | null;
  testId: string;
}) {
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {caption && <span className="block truncate text-xs text-muted-foreground">{caption}</span>}
      </span>
      {phone && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
          <Phone className="size-4" aria-hidden />
          {phone}
        </span>
      )}
    </>
  );
  const rowClass = 'flex min-h-11 items-center gap-3 rounded-lg border border-input bg-muted/40 px-3 py-2.5';
  if (!phone) {
    return (
      <li>
        <div data-testid={testId} className={rowClass}>
          {body}
        </div>
      </li>
    );
  }
  return (
    <li>
      <a data-testid={testId} href={telHref(phone)} className={`${rowClass} active:bg-muted`}>
        {body}
      </a>
    </li>
  );
}

export function ContactPanel() {
  const m = useMessages();
  const q = useQuery({
    queryKey: ['me', 'contacts'],
    queryFn: () => api<ContactPanelData>('GET', '/me/contacts'),
  });

  if (q.isPending) return <LoadingState />;
  // Never break the dashboard over a contacts footer.
  if (q.error || !q.data) return null;

  const { siteManager, supervisor, emergency } = q.data;
  if (!siteManager && !supervisor && emergency.length === 0) return null;

  return (
    <Card data-testid="contact-panel">
      <CardHeader>
        <CardTitle>{m.CONTACTS_UI.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {(siteManager || supervisor) && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {m.CONTACTS_UI.people}
            </h3>
            <ul className="grid gap-2">
              {siteManager && (
                <CallRow
                  icon={UserRound}
                  label={siteManager.name}
                  caption={m.CONTACTS_UI.siteManager}
                  phone={siteManager.phone}
                  testId="contact-site-manager"
                />
              )}
              {supervisor && (
                <CallRow
                  icon={UserRound}
                  label={supervisor.name}
                  caption={m.CONTACTS_UI.supervisor}
                  phone={supervisor.phone}
                  testId="contact-supervisor"
                />
              )}
            </ul>
          </section>
        )}
        {emergency.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {m.CONTACTS_UI.emergency}
            </h3>
            <ul className="grid gap-2">
              {emergency.map((c, i) => (
                <CallRow
                  key={`${c.kind}-${c.phone}-${i}`}
                  icon={KIND_ICONS[c.kind]}
                  label={c.label}
                  caption={m.CONTACTS_UI.KIND_LABELS[c.kind]}
                  phone={c.phone}
                  testId={`contact-emergency-${i}`}
                />
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
