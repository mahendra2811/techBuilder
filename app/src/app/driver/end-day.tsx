import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Vehicle, Person } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

export default function EndDayScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  // NOTE: user.id is a User id, NOT a Person id. Using the first person from listPeople()
  // as a mock simplification. In production, the driver's User record would have a linked personId.
  const [driverPerson, setDriverPerson] = useState<Person | null>(null);
  const [reading, setReading] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => setVehicle(res.items[0] ?? null));
    void clients.records.listPeople().then((res) => setDriverPerson(res.items[0] ?? null));
  }, [clients]);

  useEffect(load, [load]);

  async function save(): Promise<void> {
    setError('');
    if (!reading.trim()) {
      setError(t('driver.endDay.errorEmpty', 'End reading is required'));
      return;
    }
    if (!vehicle || !driverPerson) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // The mock adapter stores both start/end on the same vehicle+date entry (upserts).
      // We pass startReading: 0 so the mock upsert logic merges with the start-day entry by vehicle+date.
      await clients.records.createVehicleLog({
        id: uuidv7(),
        vehicleId: vehicle.id,
        driverPersonId: driverPerson.id,
        startReading: 0,
        endReading: Number(reading),
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
        <Text className="mb-4 text-2xl font-bold">{t('driver.endDay.title', 'End Day')}</Text>
        <Text className="mb-6 text-base text-green-600">{t('driver.endDay.saved', 'End reading saved!')}</Text>
        <Button label={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.endDay.title', 'End Day')}</Text>
        {vehicle ? (
          <Text className="mb-4 text-sm text-gray-500">{vehicle.name ?? vehicle.regNo}</Text>
        ) : null}

        <Field
          label={t('driver.endDay.reading', 'End Reading (KM / Hours)')}
          value={reading}
          onChangeText={(v) => { setReading(v); setError(''); }}
          keyboardType="numeric"
          placeholder="0"
        />

        {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}

        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !vehicle || !driverPerson}
        />
      </ScrollView>
    </Screen>
  );
}
