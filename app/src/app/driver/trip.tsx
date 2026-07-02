import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Vehicle } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

export default function TripScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => setVehicle(res.items[0] ?? null));
  }, [clients]);

  useFocusEffect(load);

  async function save(): Promise<void> {
    if (!vehicle || !fromText || !toText) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await clients.records.createTrip({
        id: uuidv7(),
        vehicleId: vehicle.id,
        fromText,
        toText,
        purpose: purpose || undefined,
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
        <Text className="mb-4 text-2xl font-bold">{t('driver.trip.title', 'Trip')}</Text>
        <Text className="mb-6 text-base text-green-600">{t('driver.trip.saved', 'Trip logged!')}</Text>
        <Button label={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.trip.title', 'Trip')}</Text>
        {vehicle ? (
          <Text className="mb-4 text-sm text-gray-500">{vehicle.name ?? vehicle.regNo}</Text>
        ) : null}

        <Field
          label={t('driver.trip.from', 'From')}
          value={fromText}
          onChangeText={setFromText}
          placeholder={t('driver.trip.fromPlaceholder', 'Departure location')}
        />

        <Field
          label={t('driver.trip.to', 'To')}
          value={toText}
          onChangeText={setToText}
          placeholder={t('driver.trip.toPlaceholder', 'Destination')}
        />

        <Field
          label={t('driver.trip.purpose', 'Purpose (optional)')}
          value={purpose}
          onChangeText={setPurpose}
          placeholder={t('driver.trip.purposePlaceholder', 'e.g. Material delivery')}
        />

        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !fromText || !toText || !vehicle}
        />
      </ScrollView>
    </Screen>
  );
}
