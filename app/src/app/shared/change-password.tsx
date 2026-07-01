import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { useSession } from '../../stores/session';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave(): Promise<void> {
    if (!currentPassword || !newPassword) return;
    setBusy(true);
    setError(null);
    try {
      await clients.auth.changePassword({ currentPassword, newPassword });
      router.back();
    } catch {
      setError(t('shared.changePasswordError', 'Could not change password. Please check your current password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold">
        {t('auth.changePassword', 'Change password')}
      </Text>

      <Field
        label={t('shared.currentPassword', 'Current password')}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <Field
        label={t('shared.newPassword', 'New password')}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {error ? (
        <Text className="mb-3 text-danger">{error}</Text>
      ) : null}

      <Button
        label={t('common.save', 'Save')}
        onPress={onSave}
        disabled={busy || !currentPassword || !newPassword}
      />
    </Screen>
  );
}
