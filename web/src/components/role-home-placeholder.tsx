import type { Role } from '@techbuilder/contracts';
import { getLocale } from '@/lib/server/locale';
import { getMessages } from '@/lib/i18n/messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Phase-1 placeholder home for a role area — proves auth + routing only. */
export async function RoleHomePlaceholder({ role }: { role: Role }) {
  const m = getMessages(await getLocale());
  return (
    <Card data-testid={`home-${role}`}>
      <CardHeader>
        <CardTitle>{m.ROLE_LABELS[role]}</CardTitle>
        <CardDescription>{m.UI.comingSoon}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
