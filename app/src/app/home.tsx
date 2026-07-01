import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Role } from '@techbuilder/contracts';
import { useSession } from '../stores/session';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';

const SLUG: Record<Role, string> = {
  OWNER: 'owner',
  SITE_MANAGER: 'site-manager',
  TEAM_HEAD: 'team-head',
  DRIVER: 'driver',
  WORKER: 'worker',
};

/** Role router: send each user to their role's home group. */
export default function Home() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  if (!user) {
    return (
      <Screen>
        <Text>{t('common.loading')}</Text>
      </Screen>
    );
  }
  return <Redirect href={`/${SLUG[user.role]}/home`} />;
}
