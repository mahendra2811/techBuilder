import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { ActionCard } from '../../ui/ActionCard';
import { useSession } from '../../stores/session';

export default function WorkerHome() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const org = useSession((s) => s.org);

  return (
    <Screen>
      {/* Digital-ID card */}
      <Card className="mb-4">
        {/* Photo placeholder */}
        <View className="mb-3 h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <Text className="text-4xl">👤</Text>
        </View>

        <Text className="text-2xl font-bold text-gray-900">{user?.name}</Text>

        {/* Role badge */}
        <View className="mt-1 mb-1 self-start rounded-full bg-brand px-3 py-1">
          <Text className="text-sm font-semibold text-white">
            {t('roles.WORKER', 'Worker')}
          </Text>
        </View>

        {user?.phone ? (
          <Text className="mt-1 text-base text-gray-600">{user.phone}</Text>
        ) : (
          <Text className="mt-1 text-base text-gray-400">
            {t('worker.noPhone', 'No phone on file')}
          </Text>
        )}

        <Text className="mt-1 text-sm text-gray-500">{org?.name}</Text>
      </Card>

      {/* Actions */}
      <View className="gap-3">
        <View className="flex-row gap-3">
          <ActionCard
            emoji="ℹ️"
            label={t('worker.myInfo', 'My Info')}
            onPress={() => router.push('/worker/my-info')}
          />
        </View>
      </View>
    </Screen>
  );
}
