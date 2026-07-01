import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { useSession } from '../../stores/session';

export default function WorkerMyInfo() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const org = useSession((s) => s.org);

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold">
        {t('worker.myInfo', 'My Info')}
      </Text>

      {/* Basic info card */}
      <Card className="mb-4">
        <Text className="mb-3 text-lg font-semibold text-gray-900">
          {t('worker.basicInfo', 'Basic Info')}
        </Text>

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
            {t('roles.WORKER', 'Worker')}
          </Text>
        </View>

        <View className="mb-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('auth.username', 'Username')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">{user?.username ?? '—'}</Text>
        </View>

        <View className="mb-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('worker.phone', 'Phone')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">{user?.phone ?? '—'}</Text>
        </View>

        <View>
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {t('worker.org', 'Organisation')}
          </Text>
          <Text className="mt-0.5 text-base text-gray-900">{org?.name ?? '—'}</Text>
        </View>
      </Card>

      {/* Attendance section — view-only, not exposed to workers in P1 */}
      <Card>
        <Text className="mb-2 text-lg font-semibold text-gray-900">
          {t('worker.attendance', 'Attendance')}
        </Text>
        <Text className="text-base text-gray-400">
          {t('worker.attendanceComingSoon', 'Attendance history coming soon.')}
        </Text>
      </Card>
    </Screen>
  );
}
