import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Completeness, OwnerDashboard } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { KpiCard } from '../../ui/KpiCard';
import { ListRow } from '../../ui/ListRow';
import { rupees, lastNDays } from '../../lib/format';

const STATE_BADGE: Record<string, string> = {
  COMPLETE: '✅ Complete',
  PARTIAL: '⚠️ Partial',
  MISSING: '❌ Missing',
};

export default function SiteManagerDashboard() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [completeness, setCompleteness] = useState<Completeness[]>([]);

  const load = useCallback(() => {
    const window = lastNDays(7);
    void clients.records.getOwnerDashboard(window).then(setDashboard);
    void clients.records.getCompleteness(lastNDays(1)).then(setCompleteness);
  }, [clients]);

  useFocusEffect(load);

  if (!dashboard) {
    return (
      <Screen>
        <Text>{t('common.loading', 'Loading…')}</Text>
      </Screen>
    );
  }

  const k = dashboard.kpis;

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-4 text-2xl font-bold">{t('nav.dashboard', 'Dashboard')}</Text>

        <View className="mb-3 flex-row gap-3">
          <KpiCard label={t('kpi.sites', 'Active Sites')} value={k.activeSites} />
          <KpiCard label={t('kpi.headcount', 'Headcount Today')} value={k.headcountToday} />
        </View>
        <View className="mb-3 flex-row gap-3">
          <KpiCard label={t('kpi.spend', 'Spend Today')} value={rupees(k.spendTodayPaise)} />
          <KpiCard label={t('kpi.issues', 'Open Issues')} value={k.openIssues} />
        </View>
        <View className="mb-4 flex-row gap-3">
          <KpiCard label={t('kpi.approvals', 'Pending Approvals')} value={k.pendingApprovals} />
        </View>

        <Text className="mb-2 text-lg font-semibold">
          {t('siteManager.completenessTitle', "Today's Completeness")}
        </Text>
        {completeness.length === 0 ? (
          <Text className="text-gray-500">{t('common.empty', 'No data')}</Text>
        ) : (
          completeness.map((c) => (
            <ListRow
              key={`${c.scopeId}-${c.businessDate}`}
              title={c.scopeId}
              subtitle={c.businessDate}
              badge={STATE_BADGE[c.state] ?? c.state}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
