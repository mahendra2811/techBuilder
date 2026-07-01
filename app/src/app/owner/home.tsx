import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ActionCard } from '../../ui/ActionCard';
import { useSession } from '../../stores/session';

export default function OwnerHome() {
  const { t } = useTranslation();
  const org = useSession((s) => s.org);
  const user = useSession((s) => s.user);
  return (
    <Screen>
      <Text className="text-2xl font-bold">{org?.name}</Text>
      <Text className="mb-4 text-base text-gray-600">
        {t('roles.OWNER')} · {user?.name}
      </Text>
      <View className="gap-3">
        <View className="flex-row gap-3">
          <ActionCard emoji="📊" label={t('nav.dashboard')} onPress={() => router.push('/owner/dashboard')} />
          <ActionCard emoji="🏗️" label={t('nav.sites')} onPress={() => router.push('/owner/sites')} />
        </View>
        <View className="flex-row gap-3">
          <ActionCard emoji="👥" label={t('nav.people')} onPress={() => router.push('/owner/people')} />
          <ActionCard emoji="🚚" label={t('nav.fleet')} onPress={() => router.push('/owner/fleet')} />
        </View>
      </View>
    </Screen>
  );
}
