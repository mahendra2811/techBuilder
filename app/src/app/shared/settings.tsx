import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useSession } from '../../stores/session';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const language = useSession((s) => s.language);

  function switchLanguage(lang: 'hi' | 'en'): void {
    useSession.getState().setLanguage(lang);
    void i18n.changeLanguage(lang);
  }

  function logout(): void {
    useSession.getState().clear();
    router.replace('/login');
  }

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold">
        {t('shared.settings', 'Settings')}
      </Text>

      {/* Language toggle */}
      <Card className="mb-4">
        <Text className="mb-3 text-base font-semibold text-gray-900">
          {t('shared.language', 'Language')}
        </Text>
        <View className="flex-row gap-3">
          <Button
            label="HI"
            variant={language === 'hi' ? 'primary' : 'secondary'}
            onPress={() => switchLanguage('hi')}
          />
          <Button
            label="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            onPress={() => switchLanguage('en')}
          />
        </View>
      </Card>

      {/* Logout */}
      <Button
        label={t('auth.logout', 'Log out')}
        variant="danger"
        onPress={logout}
      />
    </Screen>
  );
}
