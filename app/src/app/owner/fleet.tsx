import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Vehicle, VehicleType } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ListRow } from '../../ui/ListRow';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

export default function FleetScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [regNo, setRegNo] = useState('');
  const [vname, setVname] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicleTypes().then((ts) => {
      setTypes(ts);
      setTypeId((prev) => prev ?? ts[0]?.id ?? null);
    });
    void clients.records.listVehicles().then((p) => setVehicles(p.items));
  }, [clients]);
  useEffect(load, [load]);

  async function add(): Promise<void> {
    if (!regNo || !typeId) return;
    setBusy(true);
    try {
      await clients.records.createVehicle({ id: uuidv7(), vehicleTypeId: typeId, regNo, name: vname || undefined });
      setRegNo('');
      setVname('');
      load();
    } finally {
      setBusy(false);
    }
  }
  const typeName = (id: string): string => types.find((x) => x.id === id)?.name ?? id;

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">{t('fleet.vehicles')}</Text>
        {vehicles.map((v) => (
          <ListRow key={v.id} title={v.name ?? v.regNo} subtitle={`${v.regNo} · ${typeName(v.vehicleTypeId)}`} badge={v.status} />
        ))}
        {vehicles.length === 0 ? <Text className="text-gray-500">{t('common.empty')}</Text> : null}
        <View className="mt-4 rounded-2xl border border-gray-200 p-4">
          <Text className="mb-2 text-lg font-semibold">{t('fleet.add')}</Text>
          <Field label={t('fleet.regNo')} value={regNo} onChangeText={setRegNo} autoCapitalize="characters" />
          <Field label={t('fleet.vname')} value={vname} onChangeText={setVname} />
          <Text className="mb-1 text-sm font-medium text-gray-700">{t('fleet.type')}</Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {types.map((ty) => (
              <Pressable key={ty.id} onPress={() => setTypeId(ty.id)} className={`rounded-full px-3 py-2 ${typeId === ty.id ? 'bg-brand' : 'bg-gray-200'}`}>
                <Text className={typeId === ty.id ? 'text-white' : 'text-gray-900'}>{`${ty.name} (${ty.trackingMode})`}</Text>
              </Pressable>
            ))}
          </View>
          <Button label={t('common.save')} onPress={add} disabled={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}
