import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Site } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

export default function SitesScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void clients.records.listSites().then((p) => setSites(p.items));
  }, [clients]);
  useFocusEffect(load);

  async function add(): Promise<void> {
    if (!name || !code) return;
    setBusy(true);
    try {
      await clients.records.createSite({ id: uuidv7(), name, code });
      setName('');
      setCode('');
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">{t('nav.sites')}</Text>
        {sites.map((s) => (
          <ListRow key={s.id} title={s.name} subtitle={s.code} badge={s.status} />
        ))}
        {sites.length === 0 ? <Text className="text-gray-500">{t('common.empty')}</Text> : null}
        <View className="mt-4 rounded-2xl border border-gray-200 p-4">
          <Text className="mb-2 text-lg font-semibold">{t('sites.add')}</Text>
          <Field label={t('sites.name')} value={name} onChangeText={setName} />
          <Field label={t('sites.code')} value={code} onChangeText={setCode} autoCapitalize="characters" />
          <Button label={t('common.save')} onPress={add} disabled={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}
