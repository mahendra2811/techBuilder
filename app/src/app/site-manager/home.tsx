import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ActionCard } from '../../ui/ActionCard';
import { useSession } from '../../stores/session';

export default function SiteManagerHome() {
  const { t } = useTranslation();
  const org = useSession((s) => s.org);
  const user = useSession((s) => s.user);

  return (
    <Screen>
      <Text className="text-2xl font-bold">{org?.name}</Text>
      <Text className="mb-4 text-base text-gray-600">
        {t('roles.SITE_MANAGER', 'Site Manager')} · {user?.name}
      </Text>
      <View className="gap-3">
        <View className="flex-row gap-3">
          <ActionCard
            emoji="📊"
            label={t('nav.dashboard', 'Dashboard')}
            onPress={() => router.push('/site-manager/dashboard')}
          />
          <ActionCard
            emoji="✅"
            label={t('nav.attendance', 'Attendance')}
            onPress={() => router.push('/site-manager/attendance')}
          />
        </View>
        <View className="flex-row gap-3">
          <ActionCard
            emoji="📋"
            label={t('nav.records', 'Records')}
            onPress={() => router.push('/site-manager/records')}
          />
          <ActionCard
            emoji="🔔"
            label={t('nav.approvals', 'Approvals')}
            onPress={() => router.push('/site-manager/approvals')}
          />
        </View>
        <View className="flex-row gap-3">
          <ActionCard
            emoji="👷"
            label={t('nav.people', 'People')}
            onPress={() => router.push('/site-manager/people')}
          />
        </View>
      </View>
    </Screen>
  );
}
