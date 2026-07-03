import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Role } from '@techbuilder/contracts';
import { useSession } from '../stores/session';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { ListRow } from '../ui/ListRow';

/**
 * DEV-ONLY convenience screen: pick a seeded person and log in as them instantly, instead of
 * typing username/password every switch. Roster matches `backend/merchants/dev/*.csv` — update
 * this list if that seed changes. Not meant to ship to the pilot (no such shortcut in login.tsx).
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
  const [busyUsername, setBusyUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(username: string): Promise<void> {
    setBusyUsername(username);
    setError(null);
    try {
      const s = await clients.auth.login({ username, password: DEV_PASSWORD, deviceId: 'dev-role-picker' });
      setSession(s.user, s.org, s.accessToken, s.refreshToken);
      router.replace('/home');
    } catch {
      setError(`Could not log in as ${username} — check the backend is running and this seed is loaded.`);
    } finally {
      setBusyUsername(null);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-1 text-2xl font-bold">{t('app.name')}</Text>
        <Text className="mb-4 text-sm text-gray-500">DEV — choose a person to log in as instantly</Text>
        {error ? <Text className="mb-3 text-danger">{error}</Text> : null}
        {ROLE_ORDER.map((role) => {
          const people = ROSTER.filter((p) => p.role === role);
          if (!people.length) return null;
          return (
            <View key={role} className="mb-4">
              <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">{ROLE_LABEL[role]}</Text>
              {people.map((p) => (
                <ListRow
                  key={p.username}
                  title={p.name}
                  subtitle={p.username}
                  badge={busyUsername === p.username ? '…' : undefined}
                  onPress={() => loginAs(p.username)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
