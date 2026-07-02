import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { AttendanceStatus, Person, Site } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { Button } from '../../ui/Button';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY'];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  HALF_DAY: '½',
};

export default function AttendanceScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(() => {
    void clients.records.listSites().then((p) => {
      setSites(p.items);
      if (!selectedSiteId && p.items[0]) {
        setSelectedSiteId(p.items[0].id);
      }
    });
    void clients.records.listPeople().then((p) => {
      setPeople(p.items);
      // Default everyone to PRESENT
      setStatuses((prev) => {
        const next = { ...prev };
        for (const person of p.items) {
          if (!next[person.id]) next[person.id] = 'PRESENT';
        }
        return next;
      });
    });
  }, [clients, selectedSiteId]);

  useFocusEffect(load);

  function setStatus(personId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [personId]: status }));
  }

  function markAllPresent() {
    const next: Record<string, AttendanceStatus> = {};
    for (const p of people) next[p.id] = 'PRESENT';
    setStatuses(next);
  }

  async function submit(): Promise<void> {
    if (!selectedSiteId) return;
    setBusy(true);
    setSaved(false);
    try {
      const rows = people.map((p) => ({
        id: uuidv7(),
        personId: p.id,
        status: statuses[p.id] ?? 'ABSENT',
        otHours: 0,
      }));
      await clients.records.markAttendance({
        siteId: selectedSiteId,
        businessDate: today,
        rows,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">
          {t('nav.attendance', 'Attendance')}
        </Text>
        <Text className="mb-2 text-sm text-gray-500">{today}</Text>

        {/* Site selector */}
        <Text className="mb-1 text-sm font-medium text-gray-700">
          {t('siteManager.selectSite', 'Select Site')}
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {sites.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSelectedSiteId(s.id)}
              className={`rounded-full px-3 py-2 ${selectedSiteId === s.id ? 'bg-brand' : 'bg-gray-200'}`}
            >
              <Text className={selectedSiteId === s.id ? 'text-white' : 'text-gray-900'}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Mark all present */}
        <View className="mb-3">
          <Button
            label={t('siteManager.markAllPresent', 'Mark All Present')}
            onPress={markAllPresent}
            variant="secondary"
          />
        </View>

        {/* People rows with status chips */}
        {people.length === 0 ? (
          <Text className="text-gray-500">{t('common.empty', 'No people')}</Text>
        ) : (
          people.map((person) => (
            <View
              key={person.id}
              className="mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <Text className="mb-2 text-base font-medium text-gray-900">{person.name}</Text>
              <View className="flex-row gap-2">
                {STATUSES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(person.id, s)}
                    className={`rounded-full px-4 py-2 ${statuses[person.id] === s ? 'bg-brand' : 'bg-gray-200'}`}
                  >
                    <Text
                      className={`text-sm font-semibold ${statuses[person.id] === s ? 'text-white' : 'text-gray-700'}`}
                    >
                      {STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}

        <View className="mt-4">
          <Button
            label={busy ? t('common.saving', 'Saving…') : t('siteManager.submitAttendance', 'Submit Attendance')}
            onPress={submit}
            disabled={busy || !selectedSiteId}
          />
        </View>

        {saved ? (
          <Text className="mt-3 text-center text-green-600">
            {t('siteManager.attendanceSaved', 'Attendance saved!')}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
