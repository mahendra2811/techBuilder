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
  // SqliteOutboxStore.open() is async (expo-sqlite's openDatabaseAsync) — must await it before
  // swapping it in, otherwise duePending()/add() run against an unopened `db` and throw.
  useEffect(() => {
    if (mode !== 'rest') return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void SqliteOutboxStore.open().then((store) => {
      if (cancelled) return;
      outboxStore.swap(store);
      void flushOutbox();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void flushOutbox();
      });
      unsubscribe = () => sub.remove();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [mode, flushOutbox]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
