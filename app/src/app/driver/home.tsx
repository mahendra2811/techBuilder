import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Vehicle, VehicleType } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ActionCard } from '../../ui/ActionCard';
import { Card } from '../../ui/Card';

export default function DriverHome() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const user = useSession((s) => s.user);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => {
      const v = res.items[0] ?? null;
      setVehicle(v);
      if (v) {
        void clients.records.listVehicleTypes().then((types) => {
          setVehicleType(types.find((t) => t.id === v.vehicleTypeId) ?? null);
        });
      }
    });
  }, [clients]);

  useFocusEffect(load);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.home.title', 'Driver')}</Text>
        <Text className="mb-4 text-base text-gray-600">{user?.name}</Text>

        {/* Vehicle Card */}
        <Card className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-500">{t('driver.home.vehicle', 'Your Vehicle')}</Text>
          {vehicle ? (
            <View>
              <Text className="text-lg font-bold text-gray-900">{vehicle.name ?? vehicle.regNo}</Text>
              <Text className="text-sm text-gray-600">{vehicle.regNo}</Text>
              {vehicleType ? (
                <View className="mt-2 self-start rounded-full bg-gray-100 px-3 py-1">
                  <Text className="text-xs font-medium text-gray-700">
                    {vehicleType.name} · {vehicleType.trackingMode}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text className="text-gray-500">{t('driver.home.noVehicle', 'No vehicle assigned')}</Text>
          )}
        </Card>

        {/* Today summary placeholder */}
        <Card className="mb-4">
          <Text className="mb-1 text-sm font-medium text-gray-500">{t('driver.home.todaySummary', "Today's Summary")}</Text>
          <Text className="text-gray-400 text-sm">{t('driver.home.summaryHint', 'Tap Summary below to view today\'s logs')}</Text>
        </Card>

        {/* Action Cards */}
        <View className="gap-3">
          <View className="flex-row gap-3">
            <ActionCard emoji="🟢" label={t('driver.startDay.title', 'Start Day')} onPress={() => router.push('/driver/start-day')} />
            <ActionCard emoji="🔴" label={t('driver.endDay.title', 'End Day')} onPress={() => router.push('/driver/end-day')} />
          </View>
          <View className="flex-row gap-3">
            <ActionCard emoji="⛽" label={t('driver.fuel.title', 'Fuel')} onPress={() => router.push('/driver/fuel')} />
            <ActionCard emoji="🗺️" label={t('driver.trip.title', 'Trip')} onPress={() => router.push('/driver/trip')} />
          </View>
          <View className="flex-row gap-3">
            <ActionCard emoji="💰" label={t('driver.expense.title', 'Expense')} onPress={() => router.push('/driver/expense')} />
            <ActionCard emoji="⚠️" label={t('driver.issue.title', 'Issue')} onPress={() => router.push('/driver/issue')} />
          </View>
          <ActionCard emoji="📋" label={t('driver.summary.title', 'Summary')} onPress={() => router.push('/driver/summary')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
