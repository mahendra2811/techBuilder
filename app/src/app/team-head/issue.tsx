import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { IssueSeverity } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

const SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

export default function IssueScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const loadSite = useCallback(() => {
    void clients.records.listSites().then((p) => {
      const firstSite = p.items[0];
      if (firstSite) setSiteId(firstSite.id);
    });
  }, [clients]);

  useEffect(loadSite, [loadSite]);

  async function save(): Promise<void> {
    if (!description.trim()) return;
    setBusy(true);
    try {
      await clients.records.createIssue({
        id: uuidv7(),
        siteId: siteId ?? undefined,
        severity,
        description: description.trim(),
        businessDate: today,
      });
      setDescription('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const severityLabel = (s: IssueSeverity): string => {
    if (s === 'LOW') return t('teamHead.low', 'Low');
    if (s === 'MEDIUM') return t('teamHead.medium', 'Medium');
    return t('teamHead.high', 'High');
  };

  const severityColor = (s: IssueSeverity): string => {
    if (s === 'HIGH') return 'bg-danger';
    if (s === 'MEDIUM') return 'bg-orange-400';
    return 'bg-green-500';
  };

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-1 text-2xl font-bold">{t('teamHead.issue', 'Raise Issue')}</Text>
        <Text className="mb-4 text-sm text-gray-500">{today}</Text>
        {saved ? (
          <Text className="mb-3 text-base font-semibold text-green-600">{t('teamHead.issueSaved', 'Issue raised!')}</Text>
        ) : null}
        <Text className="mb-1 text-sm font-medium text-gray-700">{t('teamHead.severity', 'Severity')}</Text>
        <View className="mb-4 flex-row gap-2">
          {SEVERITIES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSeverity(s)}
              className={`rounded-full px-4 py-2 ${severity === s ? severityColor(s) : 'bg-gray-200'}`}
            >
              <Text className={severity === s ? 'text-white' : 'text-gray-900'}>{severityLabel(s)}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          label={t('teamHead.description', 'Description')}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholder={t('teamHead.issuePlaceholder', 'Describe the issue...')}
          className="min-h-24 rounded-xl border border-gray-300 px-4 py-3"
        />
        <Button
          label={t('teamHead.raiseIssue', 'Raise Issue')}
          onPress={save}
          disabled={busy || !description.trim()}
        />
      </ScrollView>
    </Screen>
  );
}
