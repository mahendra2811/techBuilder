import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { useSession } from '../../stores/session';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold">
        {t('shared.profile', 'Profile')}
      </Text>

      <Card className="mb-4">
        <View className="mb-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('people.name', 'Full name')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">{user?.name ?? '—'}</Text>
        </View>

        <View className="mb-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('worker.role', 'Role')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">
            {user?.role ? t(`roles.${user.role}`, user.role) : '—'}
          </Text>
        </View>

        <View>
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('worker.phone', 'Phone')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">{user?.phone ?? '—'}</Text>
        </View>
      </Card>

      <Button
        label={t('auth.changePassword', 'Change password')}
        variant="secondary"
        onPress={() => router.push('/shared/change-password')}
      />
    </Screen>
  );
}
