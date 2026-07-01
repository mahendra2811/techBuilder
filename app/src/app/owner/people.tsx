import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Role, User } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

const CREATABLE: Role[] = ['SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'];

export default function PeopleScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('SITE_MANAGER');
  const [tempPassword, setTempPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void clients.records.listUsers().then((p) => setUsers(p.items));
  }, [clients]);
  useEffect(load, [load]);

  async function add(): Promise<void> {
    if (!name || !username || !tempPassword) return;
    setBusy(true);
    try {
      await clients.records.createUser({ id: uuidv7(), name, username, role, tempPassword });
      setName('');
      setUsername('');
      setTempPassword('');
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">{t('nav.people')}</Text>
        {users.map((u) => (
          <ListRow key={u.id} title={u.name} subtitle={u.username} badge={t(`roles.${u.role}`)} />
        ))}
        {users.length === 0 ? <Text className="text-gray-500">{t('common.empty')}</Text> : null}
        <View className="mt-4 rounded-2xl border border-gray-200 p-4">
          <Text className="mb-2 text-lg font-semibold">{t('people.add')}</Text>
          <Field label={t('people.name')} value={name} onChangeText={setName} />
          <Field label={t('people.username')} value={username} onChangeText={setUsername} autoCapitalize="none" />
          <Text className="mb-1 text-sm font-medium text-gray-700">{t('people.role')}</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {CREATABLE.map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} className={`rounded-full px-3 py-2 ${role === r ? 'bg-brand' : 'bg-gray-200'}`}>
                <Text className={role === r ? 'text-white' : 'text-gray-900'}>{t(`roles.${r}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t('people.tempPassword')} value={tempPassword} onChangeText={setTempPassword} />
          <Button label={t('common.save')} onPress={add} disabled={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}
