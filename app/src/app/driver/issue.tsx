import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { IssueSeverity } from '@techbuilder/contracts';
import type { Vehicle } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

// All severities from frozen enums: LOW | MEDIUM | HIGH
const SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

const SEVERITY_COLORS: Record<IssueSeverity, string> = {
  LOW: 'bg-green-100',
  MEDIUM: 'bg-yellow-100',
  HIGH: 'bg-red-100',
};
const SEVERITY_ACTIVE_COLORS: Record<IssueSeverity, string> = {
  LOW: 'bg-green-500',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-red-500',
};

export default function IssueScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [severity, setSeverity] = useState<IssueSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => setVehicle(res.items[0] ?? null));
  }, [clients]);

  useEffect(load, [load]);

  async function save(): Promise<void> {
    if (!description.trim() || !vehicle) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await clients.records.createIssue({
        id: uuidv7(),
        vehicleId: vehicle.id,
        severity,
        description: description.trim(),
        businessDate: today,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const severityLabel = (s: IssueSeverity): string => {
    const labels: Record<IssueSeverity, string> = {
      LOW: t('issue.severity.LOW', 'Low'),
      MEDIUM: t('issue.severity.MEDIUM', 'Medium'),
      HIGH: t('issue.severity.HIGH', 'High'),
    };
    return labels[s];
  };

  if (saved) {
    return (
      <Screen>
        <Text className="mb-4 text-2xl font-bold">{t('driver.issue.title', 'Issue')}</Text>
        <Text className="mb-6 text-base text-green-600">{t('driver.issue.saved', 'Issue reported!')}</Text>
        <Button label={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.issue.title', 'Issue')}</Text>
        {vehicle ? (
          <Text className="mb-4 text-sm text-gray-500">{vehicle.name ?? vehicle.regNo}</Text>
        ) : null}

        <Text className="mb-1 text-sm font-medium text-gray-700">{t('driver.issue.severity', 'Severity')}</Text>
        <View className="mb-3 flex-row gap-2">
          {SEVERITIES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSeverity(s)}
              className={`flex-1 items-center rounded-full px-3 py-2 ${severity === s ? SEVERITY_ACTIVE_COLORS[s] : SEVERITY_COLORS[s]}`}
            >
              <Text className={severity === s ? 'text-white font-semibold' : 'text-gray-800'}>
                {severityLabel(s)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          label={t('driver.issue.description', 'Description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('driver.issue.descriptionPlaceholder', 'Describe the issue...')}
          multiline
          numberOfLines={4}
        />

        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !description.trim() || !vehicle}
        />
      </ScrollView>
    </Screen>
  );
}
