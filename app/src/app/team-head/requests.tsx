import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { ApprovalRequest, ApprovalType } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';

const REQUEST_TYPES: ApprovalType[] = ['LEAVE', 'MATERIAL', 'VEHICLE_SWITCH'];

export default function RequestsScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [type, setType] = useState<ApprovalType>('LEAVE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<ApprovalRequest[]>([]);

  const loadPending = useCallback(() => {
    void clients.records.listRequests('PENDING').then(setPending);
  }, [clients]);

  useFocusEffect(loadPending);

  async function submit(): Promise<void> {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await clients.records.submitRequest({
        id: uuidv7(),
        type,
        payload: { note: note.trim() },
      });
      setNote('');
      setSubmitted(true);
      loadPending();
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (ty: ApprovalType): string => {
    if (ty === 'LEAVE') return t('teamHead.leaveRequest', 'Leave');
    if (ty === 'MATERIAL') return t('teamHead.materialRequest', 'Material');
    return t('teamHead.vehicleSwitch', 'Vehicle Switch');
  };

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-4 text-2xl font-bold">{t('teamHead.requests', 'Requests')}</Text>

        {/* Submit new request */}
        <View className="mb-4 rounded-2xl border border-gray-200 p-4">
          <Text className="mb-2 text-lg font-semibold">{t('teamHead.newRequest', 'New Request')}</Text>
          {submitted ? (
            <Text className="mb-2 text-base font-semibold text-green-600">{t('teamHead.requestSubmitted', 'Request submitted!')}</Text>
          ) : null}
          <Text className="mb-1 text-sm font-medium text-gray-700">{t('teamHead.requestType', 'Type')}</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {REQUEST_TYPES.map((ty) => (
              <Pressable
                key={ty}
                onPress={() => setType(ty)}
                className={`rounded-full px-3 py-2 ${type === ty ? 'bg-brand' : 'bg-gray-200'}`}
              >
                <Text className={type === ty ? 'text-white' : 'text-gray-900'}>{typeLabel(ty)}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label={t('teamHead.note', 'Note')}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholder={t('teamHead.notePlaceholder', 'Add a note...')}
          />
          <Button label={t('common.submit', 'Submit')} onPress={submit} disabled={busy || !note.trim()} />
        </View>

        {/* Pending requests list */}
        <Text className="mb-2 text-lg font-semibold">{t('teamHead.pendingRequests', 'Pending Requests')}</Text>
        {pending.map((req) => (
          <ListRow
            key={req.id}
            title={typeLabel(req.type)}
            subtitle={(req.payload as { note?: string }).note ?? ''}
            badge={req.status}
          />
        ))}
        {pending.length === 0 ? (
          <Text className="text-gray-500">{t('common.empty', 'No pending requests')}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
