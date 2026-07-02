import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { OwnerDashboard } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { KpiCard } from '../../ui/KpiCard';
import { rupees, lastNDays } from '../../lib/format';

export default function OwnerDashboardScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [data, setData] = useState<OwnerDashboard | null>(null);

  const load = useCallback(() => {
    void clients.records.getOwnerDashboard(lastNDays(7)).then(setData);
  }, [clients]);
  useFocusEffect(load);

  if (!data) {
    return (
      <Screen>
        <Text>{t('common.loading')}</Text>
      </Screen>
    );
  }
  const k = data.kpis;

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-4 text-2xl font-bold">{t('nav.dashboard')}</Text>
        <View className="mb-3 flex-row gap-3">
          <KpiCard label={t('kpi.sites')} value={k.activeSites} />
          <KpiCard label={t('kpi.headcount')} value={k.headcountToday} />
        </View>
        <View className="mb-3 flex-row gap-3">
          <KpiCard label={t('kpi.vehicles')} value={k.vehiclesActiveToday} />
          <KpiCard label={t('kpi.spend')} value={rupees(k.spendTodayPaise)} />
        </View>
        <View className="mb-3 flex-row gap-3">
          <KpiCard label={t('kpi.issues')} value={k.openIssues} />
          <KpiCard label={t('kpi.approvals')} value={k.pendingApprovals} />
        </View>
      </ScrollView>
    </Screen>
  );
}
