import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Notification } from '@techbuilder/contracts';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { useSession } from '../../stores/session';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = useCallback(() => {
    void clients.records.listNotifications().then(setNotifications);
  }, [clients]);

  useEffect(load, [load]);

  async function markRead(id: string): Promise<void> {
    await clients.records.markNotificationRead(id);
    load();
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">
          {t('shared.notifications', 'Notifications')}
        </Text>

        {notifications.length === 0 ? (
          <Text className="text-gray-500">{t('common.empty', 'Nothing yet')}</Text>
        ) : (
          notifications.map((n) => {
            const title =
              (n.payload && typeof n.payload === 'object' && 'title' in n.payload
                ? String((n.payload as Record<string, unknown>).title)
                : null) ?? n.type;
            const badge = n.readAt ? undefined : t('shared.unread', 'New');
            return (
              <ListRow
                key={n.id}
                title={title}
                subtitle={n.type}
                badge={badge}
                onPress={() => void markRead(n.id)}
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
