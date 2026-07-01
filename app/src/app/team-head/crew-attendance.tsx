import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { AttendanceStatus, Person } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY'];

interface CrewRow {
  personId: string;
  name: string;
  status: AttendanceStatus;
}

export default function CrewAttendanceScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [rows, setRows] = useState<CrewRow[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(() => {
    void clients.records.listSites().then((p) => {
      const firstSite = p.items[0];
      if (firstSite) setSiteId(firstSite.id);
    });
    void clients.records.listPeople().then((p) => {
      setRows(
        p.items.map((person: Person) => ({
          personId: person.id,
          name: person.name,
          status: 'PRESENT' as AttendanceStatus,
        })),
      );
    });
  }, [clients]);

  useEffect(load, [load]);

  function setStatus(personId: string, status: AttendanceStatus): void {
    setRows((prev) => prev.map((r) => (r.personId === personId ? { ...r, status } : r)));
  }

  function markAllPresent(): void {
    setRows((prev) => prev.map((r) => ({ ...r, status: 'PRESENT' as AttendanceStatus })));
  }

  async function submit(): Promise<void> {
    if (!siteId || rows.length === 0) return;
    setBusy(true);
    try {
      await clients.records.markAttendance({
        siteId,
        businessDate: today,
        rows: rows.map((r) => ({ id: uuidv7(), personId: r.personId, status: r.status })),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (s: AttendanceStatus): string => {
    if (s === 'PRESENT') return t('teamHead.present', 'Present');
    if (s === 'ABSENT') return t('teamHead.absent', 'Absent');
    return t('teamHead.halfDay', 'Half');
  };

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-1 text-2xl font-bold">{t('teamHead.crewAttendance', 'Crew Attendance')}</Text>
        <Text className="mb-4 text-sm text-gray-500">{today}</Text>
        {saved ? (
          <Text className="mb-3 text-base font-semibold text-green-600">{t('teamHead.attendanceSaved', 'Attendance saved!')}</Text>
        ) : null}
        <Button label={t('teamHead.allPresent', 'Mark All Present')} variant="secondary" onPress={markAllPresent} />
        <View className="mt-3 gap-2">
          {rows.map((row) => (
            <View key={row.personId} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <Text className="mb-2 text-base font-medium text-gray-900">{row.name}</Text>
              <View className="flex-row gap-2">
                {STATUSES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(row.personId, s)}
                    className={`rounded-full px-3 py-2 ${row.status === s ? 'bg-brand' : 'bg-gray-200'}`}
                  >
                    <Text className={row.status === s ? 'text-white' : 'text-gray-900'}>{statusLabel(s)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
        {rows.length === 0 ? (
          <Text className="mt-4 text-gray-500">{t('common.empty', 'No records')}</Text>
        ) : null}
        <View className="mt-4">
          <Button label={t('common.submit', 'Submit')} onPress={submit} disabled={busy || rows.length === 0} />
        </View>
      </ScrollView>
    </Screen>
  );
}
