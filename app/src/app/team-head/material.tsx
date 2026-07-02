import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { Uom } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

const UOMS: Uom[] = ['BAG', 'KG', 'CFT', 'NOS', 'MT', 'LITRE'];

export default function MaterialScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [qty, setQty] = useState('');
  const [uom, setUom] = useState<Uom>('BAG');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const loadSite = useCallback(() => {
    void clients.records.listSites().then((p) => {
      const firstSite = p.items[0];
      if (firstSite) setSiteId(firstSite.id);
    });
  }, [clients]);

  useFocusEffect(loadSite);

  async function save(): Promise<void> {
    const parsedQty = parseFloat(qty);
    if (!siteId || !materialName.trim() || isNaN(parsedQty) || parsedQty <= 0) return;
    setBusy(true);
    try {
      await clients.records.createMaterialTxn({
        id: uuidv7(),
        type: 'CONSUME',
        materialId: uuidv7(),
        qty: parsedQty,
        uom,
        siteId,
        businessDate: today,
      });
      setMaterialName('');
      setQty('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-1 text-2xl font-bold">{t('teamHead.material', 'Material')}</Text>
        <Text className="mb-4 text-sm text-gray-500">{today}</Text>
        {saved ? (
          <Text className="mb-3 text-base font-semibold text-green-600">{t('teamHead.materialSaved', 'Material recorded!')}</Text>
        ) : null}
        <Field
          label={t('teamHead.materialName', 'Material Name')}
          value={materialName}
          onChangeText={setMaterialName}
          placeholder={t('teamHead.materialNamePlaceholder', 'e.g. Cement, Sand')}
        />
        <Field
          label={t('teamHead.qty', 'Quantity')}
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <Text className="mb-1 text-sm font-medium text-gray-700">{t('teamHead.uom', 'Unit')}</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {UOMS.map((u) => (
            <Pressable
              key={u}
              onPress={() => setUom(u)}
              className={`rounded-full px-3 py-2 ${uom === u ? 'bg-brand' : 'bg-gray-200'}`}
            >
              <Text className={uom === u ? 'text-white' : 'text-gray-900'}>{u}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !materialName.trim() || !qty}
        />
      </ScrollView>
    </Screen>
  );
}
