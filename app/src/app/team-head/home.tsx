import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ActionCard } from '../../ui/ActionCard';

export default function TeamHeadHome() {
  const { t } = useTranslation();
  const org = useSession((s) => s.org);
  const user = useSession((s) => s.user);

  return (
    <Screen>
      <Text className="text-2xl font-bold">{org?.name}</Text>
      <Text className="mb-4 text-base text-gray-600">
        {t('roles.TEAM_HEAD', 'Team Head')} · {user?.name}
      </Text>
      <View className="gap-3">
        <View className="flex-row gap-3">
          <ActionCard
            emoji="✅"
            label={t('teamHead.crewAttendance', 'Crew Attendance')}
            onPress={() => router.push('/team-head/crew-attendance')}
          />
          <ActionCard
            emoji="📝"
            label={t('teamHead.progress', 'Progress Note')}
            onPress={() => router.push('/team-head/progress')}
          />
        </View>
        <View className="flex-row gap-3">
          <ActionCard
            emoji="🧱"
            label={t('teamHead.material', 'Material')}
            onPress={() => router.push('/team-head/material')}
          />
          <ActionCard
            emoji="⚠️"
            label={t('teamHead.issue', 'Raise Issue')}
            onPress={() => router.push('/team-head/issue')}
          />
        </View>
        <View className="flex-row gap-3">
          <ActionCard
            emoji="📋"
            label={t('teamHead.requests', 'Requests')}
            onPress={() => router.push('/team-head/requests')}
          />
        </View>
      </View>
    </Screen>
  );
}
