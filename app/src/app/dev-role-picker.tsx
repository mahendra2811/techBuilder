import { useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Role } from '@techbuilder/contracts';
import { useSession } from '../stores/session';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';

/**
 * DEV-ONLY convenience screen: pick a seeded person, then confirm with a button to log in as
 * them — two explicit steps (select → login), instead of typing username/password every switch.
 * Roster matches `backend/merchants/dev/*.csv` — update this list if that seed changes.
 * Not meant to ship to the pilot (no such shortcut in login.tsx).
 */
const DEV_PASSWORD = 'changeme123';

interface DevPerson {
  username: string;
  name: string;
  role: Role;
}

const ROSTER: DevPerson[] = [
  { username: 'owner', name: 'Owner Sahab', role: 'OWNER' },
  { username: 'sm1', name: 'Rajesh Site Manager', role: 'SITE_MANAGER' },
  { username: 'th1', name: 'Mistri Greenfield', role: 'TEAM_HEAD' },
  { username: 'th2', name: 'Mistri Sunrise', role: 'TEAM_HEAD' },
  { username: 'driver1', name: 'Dinesh Driver', role: 'DRIVER' },
  { username: 'driver2', name: 'Ramesh Driver', role: 'DRIVER' },
  { username: 'driver3', name: 'Suraj Driver', role: 'DRIVER' },
  { username: 'driver4', name: 'Manoj Driver', role: 'DRIVER' },
  { username: 'worker1', name: 'Ramu Yadav', role: 'WORKER' },
  { username: 'worker2', name: 'Shyam Kumar', role: 'WORKER' },
  { username: 'worker3', name: 'Mangal Singh', role: 'WORKER' },
  { username: 'worker4', name: 'Suresh Prasad', role: 'WORKER' },
  { username: 'worker5', name: 'Vikram Rathore', role: 'WORKER' },
  { username: 'worker6', name: 'Ajay Kumar', role: 'WORKER' },
];

const ROLE_ORDER: Role[] = ['OWNER', 'SITE_MANAGER', 'TEAM_HEAD', 'DRIVER', 'WORKER'];
const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  SITE_MANAGER: 'Site Manager',
  TEAM_HEAD: 'Team Head',
  DRIVER: 'Driver',
  WORKER: 'Worker',
};

export default function DevRolePicker() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const setSession = useSession((s) => s.setSession);
  const [selected, setSelected] = useState<DevPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmLogin(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const s = await clients.auth.login({ username: selected.username, password: DEV_PASSWORD, deviceId: 'dev-role-picker' });
      setSession(s.user, s.org, s.accessToken, s.refreshToken);
      router.replace('/home');
    } catch {
      setError(`Could not log in as ${selected.name} — check the backend is running and this seed is loaded.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView className="flex-1">
        <Text className="mb-1 text-2xl font-bold">{t('app.name')}</Text>
        <Text className="mb-4 text-sm text-gray-500">DEV — select a person below, then tap Login</Text>
        {error ? <Text className="mb-3 text-danger">{error}</Text> : null}
        {ROLE_ORDER.map((role) => {
          const people = ROSTER.filter((p) => p.role === role);
          if (!people.length) return null;
          return (
            <View key={role} className="mb-4">
              <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">{ROLE_LABEL[role]}</Text>
              {people.map((p) => {
                const isSelected = selected?.username === p.username;
                return (
                  <Pressable
                    key={p.username}
                    onPress={() => setSelected(p)}
                    className={`mb-2 flex-row items-center justify-between rounded-xl border px-4 py-3 ${
                      isSelected ? 'border-brand bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-base font-medium text-gray-900">{p.name}</Text>
                      <Text className="text-sm text-gray-500">{p.username}</Text>
                    </View>
                    {isSelected ? <Text className="text-brand text-lg">✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <View className="pt-3">
        <Button
          label={selected ? `Login as ${selected.name}` : 'Select a person above'}
          onPress={confirmLogin}
          disabled={!selected || busy}
        />
      </View>
    </Screen>
  );
}
