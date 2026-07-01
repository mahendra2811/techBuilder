import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ApprovalRequest } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';

export default function ApprovalsScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void clients.records.listRequests('PENDING').then((r) => {
      setRequests(r);
      setLoading(false);
    });
  }, [clients]);

  useEffect(load, [load]);

  async function decide(id: string, approve: boolean): Promise<void> {
    setDeciding(id);
    try {
      await clients.records.decideRequest(id, { approve });
      load();
    } finally {
      setDeciding(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Text>{t('common.loading', 'Loading…')}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-4 text-2xl font-bold">
          {t('nav.approvals', 'Approvals')}
        </Text>

        {requests.length === 0 ? (
          <Text className="text-gray-500">
            {t('siteManager.noApprovals', 'No pending approvals')}
          </Text>
        ) : (
          requests.map((req) => (
            <View
              key={req.id}
              className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-gray-900">{req.type}</Text>
                <Text className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                  {req.status}
                </Text>
              </View>
              <Text className="mb-1 text-sm text-gray-500">
                {t('siteManager.requestedBy', 'Requested by')}: {req.requestedBy}
              </Text>
              <Text className="mb-3 text-sm text-gray-500">
                {t('siteManager.createdAt', 'At')}: {req.createdAt.slice(0, 10)}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    label={
                      deciding === req.id
                        ? t('common.saving', 'Saving…')
                        : t('siteManager.approve', 'Approve')
                    }
                    onPress={() => void decide(req.id, true)}
                    disabled={deciding !== null}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label={
                      deciding === req.id
                        ? t('common.saving', 'Saving…')
                        : t('siteManager.reject', 'Reject')
                    }
                    variant="danger"
                    onPress={() => void decide(req.id, false)}
                    disabled={deciding !== null}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
