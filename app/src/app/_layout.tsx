import '../../global.css';
import '../i18n';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { outboxStore, useSession } from '../stores/session';
import { SqliteOutboxStore } from '../engine/sync/sqlite-outbox-store';

export default function RootLayout() {
  const mode = useSession((s) => s.mode);
  const flushOutbox = useSession((s) => s.flushOutbox);

  // WP-6: persistent outbox + flush on boot and whenever the app returns to the foreground.
  useEffect(() => {
    if (mode !== 'rest') return;
    outboxStore.swap(new SqliteOutboxStore());
    void flushOutbox();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushOutbox();
    });
    return () => sub.remove();
  }, [mode, flushOutbox]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
