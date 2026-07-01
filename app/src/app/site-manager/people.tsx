import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Person } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { rupees } from '../../lib/format';

export default function SiteManagerPeople() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void clients.records.listPeople().then((p) => {
      setPeople(p.items);
      setLoading(false);
    });
  }, [clients]);

  useEffect(load, [load]);

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
          {t('nav.people', 'People')}
        </Text>
        {people.length === 0 ? (
          <Text className="text-gray-500">{t('common.empty', 'No people')}</Text>
        ) : (
          people.map((person) => (
            <ListRow
              key={person.id}
              title={person.name}
              subtitle={[
                person.skill ?? t('siteManager.unskilled', 'Unskilled'),
                person.defaultWagePaise != null
                  ? rupees(person.defaultWagePaise) + '/day'
                  : null,
                person.phone ?? null,
              ]
                .filter(Boolean)
                .join(' · ')}
              badge={person.active ? t('siteManager.active', 'Active') : t('siteManager.inactive', 'Inactive')}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
