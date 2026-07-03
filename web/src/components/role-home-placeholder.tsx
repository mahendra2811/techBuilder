import type { Role } from '@techbuilder/contracts';
import { ROLE_LABEL } from '@/lib/roles';
import { UI } from '@/lib/messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Phase-1 placeholder home for a role area — proves auth + routing only. */
export function RoleHomePlaceholder({ role }: { role: Role }) {
  return (
    <Card data-testid={`home-${role}`}>
      <CardHeader>
        <CardTitle>{ROLE_LABEL[role]}</CardTitle>
        <CardDescription>{UI.comingSoon}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
