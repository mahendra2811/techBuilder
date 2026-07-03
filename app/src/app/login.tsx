import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../stores/session';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export default function Login() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const setSession = useSession((s) => s.setSession);
  const [username, setUsername] = useState('acme_owner'); // seeded mock owner
  const [password, setPassword] = useState('changeme123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onLogin(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const s = await clients.auth.login({ username, password, deviceId: 'device-1' });
      setSession(s.user, s.org, s.accessToken, s.refreshToken);
      router.replace('/home');
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text className="mb-6 text-2xl font-bold">{t('app.name')}</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder={t('auth.username')}
        autoCapitalize="none"
        className="mb-3 min-h-12 rounded-xl border border-gray-300 px-4"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        secureTextEntry
        className="mb-3 min-h-12 rounded-xl border border-gray-300 px-4"
      />
      {error ? <Text className="mb-3 text-danger">{error}</Text> : null}
      <Button label={t('auth.login')} onPress={onLogin} disabled={busy} />
      {/* DEV-only shortcut — remove before the pilot. See dev-role-picker.tsx. */}
      <View className="mt-3">
        <Button
          label="DEV: choose a role instead"
          onPress={() => router.push('/dev-role-picker')}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}
