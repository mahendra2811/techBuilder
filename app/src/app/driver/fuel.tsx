import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Vehicle } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { rupees } from '../../lib/format';

export default function FuelScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [amount, setAmount] = useState('');   // ₹ as entered by user
  const [litres, setLitres] = useState('');
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => setVehicle(res.items[0] ?? null));
  }, [clients]);

  useEffect(load, [load]);

  // Auto-computed cost per litre (display only)
  const costPerLitre: string | null =
    amount && litres && Number(litres) > 0
      ? rupees((Number(amount) * 100) / Number(litres)) + '/L'
      : null;

  async function save(): Promise<void> {
    if (!vehicle || !amount || !litres || !reading) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const amountPaise = Math.round(Number(amount) * 100);
      await clients.records.createFuelLog({
        id: uuidv7(),
        vehicleId: vehicle.id,
        amountPaise,
        litres: Number(litres),
        reading: Number(reading),
        businessDate: today,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Screen>
        <Text className="mb-4 text-2xl font-bold">{t('driver.fuel.title', 'Fuel')}</Text>
        <Text className="mb-6 text-base text-green-600">{t('driver.fuel.saved', 'Fuel log saved!')}</Text>
        <Button label={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.fuel.title', 'Fuel')}</Text>
        {vehicle ? (
          <Text className="mb-4 text-sm text-gray-500">{vehicle.name ?? vehicle.regNo}</Text>
        ) : null}

        <Field
          label={t('driver.fuel.amount', 'Amount (₹)')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
        />

        <Field
          label={t('driver.fuel.litres', 'Litres')}
          value={litres}
          onChangeText={setLitres}
          keyboardType="numeric"
          placeholder="0"
        />

        <Field
          label={t('driver.fuel.reading', 'Odometer Reading (KM / Hours)')}
          value={reading}
          onChangeText={setReading}
          keyboardType="numeric"
          placeholder="0"
        />

        {/* Auto-computed cost/litre display */}
        {costPerLitre ? (
          <View className="mb-3 rounded-xl bg-blue-50 px-4 py-3">
            <Text className="text-sm text-blue-700">
              {t('driver.fuel.costPerLitre', 'Cost per litre')}: {costPerLitre}
            </Text>
          </View>
        ) : null}

        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !amount || !litres || !reading || !vehicle}
        />
      </ScrollView>
    </Screen>
  );
}
