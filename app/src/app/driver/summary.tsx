import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Vehicle, VehicleLog, FuelLog } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { rupees, lastNDays } from '../../lib/format';

export default function SummaryScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicleLog, setVehicleLog] = useState<VehicleLog | null>(null);
  const [fuelLog, setFuelLog] = useState<FuelLog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void clients.records.listVehicles().then(async (res) => {
      const v = res.items[0] ?? null;
      setVehicle(v);

      if (!v) {
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const window = lastNDays(1);

      // listRecords for 'vehicle-log' and 'fuel' — these entity types are not in the mock's map,
      // so mock returns empty. Cast to the domain types; the auto-summary placeholder below
      // handles the empty case gracefully. Real REST adapter will populate these.
      try {
        const [vlRes, flRes] = await Promise.all([
          clients.records.listRecords('vehicle-log', null, window),
          clients.records.listRecords('fuel', null, window),
        ]);

        // Filter by today's date for this vehicle
        const vl = (vlRes.items as VehicleLog[]).find(
          (r) => r.vehicleId === v.id && r.businessDate === today
        ) ?? null;
        const fl = (flRes.items as FuelLog[]).find(
          (r) => r.vehicleId === v.id && r.businessDate === today
        ) ?? null;

        setVehicleLog(vl);
        setFuelLog(fl);
      } finally {
        setLoading(false);
      }
    });
  }, [clients]);

  useEffect(load, [load]);

  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <Screen>
        <Text>{t('common.loading', 'Loading...')}</Text>
      </Screen>
    );
  }

  // Compute distance if both readings are available
  const distance =
    vehicleLog?.startReading != null && vehicleLog?.endReading != null
      ? vehicleLog.endReading - vehicleLog.startReading
      : null;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.summary.title', 'Summary')}</Text>
        <Text className="mb-4 text-sm text-gray-500">{today}</Text>

        {/* Vehicle info */}
        {vehicle ? (
          <Card className="mb-3">
            <Text className="mb-1 text-sm font-medium text-gray-500">{t('driver.summary.vehicle', 'Vehicle')}</Text>
            <Text className="text-base font-bold">{vehicle.name ?? vehicle.regNo}</Text>
            <Text className="text-sm text-gray-600">{vehicle.regNo}</Text>
          </Card>
        ) : null}

        {/* Vehicle log (start/end readings) */}
        <Card className="mb-3">
          <Text className="mb-2 text-sm font-medium text-gray-500">{t('driver.summary.readings', 'Readings')}</Text>
          {vehicleLog ? (
            <View className="gap-1">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">{t('driver.summary.startReading', 'Start')}</Text>
                <Text className="text-sm font-semibold">{vehicleLog.startReading}</Text>
              </View>
              {vehicleLog.endReading != null ? (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-gray-600">{t('driver.summary.endReading', 'End')}</Text>
                  <Text className="text-sm font-semibold">{vehicleLog.endReading}</Text>
                </View>
              ) : null}
              {distance != null ? (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-gray-600">{t('driver.summary.distance', 'Distance')}</Text>
                  <Text className="text-sm font-semibold text-brand">{distance}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            // Auto-summary placeholder — listRecords for vehicle-log not in mock map;
            // REST adapter will return real data in STEP 4.
            <Text className="text-sm text-gray-400">
              {t('driver.summary.noLog', 'No log recorded yet today (auto-summary)')}
            </Text>
          )}
        </Card>

        {/* Fuel log */}
        <Card className="mb-3">
          <Text className="mb-2 text-sm font-medium text-gray-500">{t('driver.summary.fuel', 'Fuel')}</Text>
          {fuelLog ? (
            <View className="gap-1">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">{t('driver.summary.fuelAmount', 'Amount')}</Text>
                <Text className="text-sm font-semibold">{rupees(fuelLog.amountPaise)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-600">{t('driver.summary.litres', 'Litres')}</Text>
                <Text className="text-sm font-semibold">{fuelLog.litres} L</Text>
              </View>
              {fuelLog.litres > 0 ? (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-gray-600">{t('driver.summary.costPerLitre', '₹/L')}</Text>
                  <Text className="text-sm font-semibold">{rupees(fuelLog.amountPaise / fuelLog.litres)}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            // Auto-summary placeholder — same note as vehicle-log above.
            <Text className="text-sm text-gray-400">
              {t('driver.summary.noFuel', 'No fuel entry today (auto-summary)')}
            </Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
