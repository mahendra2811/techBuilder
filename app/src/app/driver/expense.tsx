import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { ExpenseCategory } from '@techbuilder/contracts';
import type { Vehicle, Site } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

// Driver-relevant expense categories (subset of EXPENSE_CATEGORIES from enums)
const DRIVER_CATEGORIES: ExpenseCategory[] = ['TRANSPORT', 'REPAIR', 'FOOD', 'MISC'];

export default function ExpenseScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void clients.records.listVehicles().then((res) => {
      const v = res.items[0] ?? null;
      setVehicle(v);
      if (v?.assignedSiteId) {
        void clients.records.getSite(v.assignedSiteId).then(setSite);
      } else {
        // Fallback: use first available site
        void clients.records.listSites().then((s) => setSite(s.items[0] ?? null));
      }
    });
  }, [clients]);

  useFocusEffect(load);

  async function save(): Promise<void> {
    if (!amount || !site) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const amountPaise = Math.round(Number(amount) * 100);
      await clients.records.createExpense({
        id: uuidv7(),
        siteId: site.id,
        category,
        amountPaise,
        businessDate: today,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  const categoryLabel = (c: ExpenseCategory): string => {
    const labels: Record<ExpenseCategory, string> = {
      TRANSPORT: t('expense.category.TRANSPORT', 'Transport'),
      REPAIR: t('expense.category.REPAIR', 'Repair'),
      FOOD: t('expense.category.FOOD', 'Food'),
      MISC: t('expense.category.MISC', 'Misc'),
      SUPPLIES: t('expense.category.SUPPLIES', 'Supplies'),
      LABOUR: t('expense.category.LABOUR', 'Labour'),
    };
    return labels[c] ?? c;
  };

  if (saved) {
    return (
      <Screen>
        <Text className="mb-4 text-2xl font-bold">{t('driver.expense.title', 'Expense')}</Text>
        <Text className="mb-6 text-base text-green-600">{t('driver.expense.saved', 'Expense saved!')}</Text>
        <Button label={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-2xl font-bold">{t('driver.expense.title', 'Expense')}</Text>
        {vehicle ? (
          <Text className="mb-4 text-sm text-gray-500">{vehicle.name ?? vehicle.regNo}</Text>
        ) : null}

        <Field
          label={t('driver.expense.amount', 'Amount (₹)')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
        />

        <Text className="mb-1 text-sm font-medium text-gray-700">{t('driver.expense.category', 'Category')}</Text>
        <View className="mb-3 flex-row flex-wrap gap-2">
          {DRIVER_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              className={`rounded-full px-4 py-2 ${category === c ? 'bg-brand' : 'bg-gray-200'}`}
            >
              <Text className={category === c ? 'text-white font-semibold' : 'text-gray-900'}>
                {categoryLabel(c)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button
          label={t('common.save', 'Save')}
          onPress={save}
          disabled={busy || !amount || !site}
        />
      </ScrollView>
    </Screen>
  );
}
