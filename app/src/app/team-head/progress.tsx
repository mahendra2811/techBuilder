import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { TextInput, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';

export default function ProgressScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const loadSite = useCallback(() => {
    void clients.records.listSites().then((p) => {
      const firstSite = p.items[0];
      if (firstSite) setSiteId(firstSite.id);
    });
  }, [clients]);

  useFocusEffect(loadSite);

  async function save(): Promise<void> {
    if (!siteId || !text.trim()) return;
    setBusy(true);
    try {
      await clients.records.createProgressNote({
        id: uuidv7(),
        siteId,
        text: text.trim(),
        businessDate: today,
      });
      // Photo/voice capture is a later step — camera libs not imported yet.
      setText('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text className="mb-1 text-2xl font-bold">{t('teamHead.progress', 'Progress Note')}</Text>
      <Text className="mb-4 text-sm text-gray-500">{today}</Text>
      {saved ? (
        <Text className="mb-3 text-base font-semibold text-green-600">{t('teamHead.progressSaved', 'Progress note saved!')}</Text>
      ) : null}
      <View className="mb-3">
        <Text className="mb-1 text-sm font-medium text-gray-700">{t('teamHead.progressText', 'What was done today?')}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder={t('teamHead.progressPlaceholder', 'Describe today\'s work...')}
          className="min-h-32 rounded-xl border border-gray-300 px-4 py-3"
        />
      </View>
      <Button label={t('common.save', 'Save')} onPress={save} disabled={busy || !text.trim()} />
    </Screen>
  );
}
