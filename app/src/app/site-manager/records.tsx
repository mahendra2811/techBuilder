import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { uuidv7 } from 'uuidv7';
import { useTranslation } from 'react-i18next';
import type { ExpenseCategory, IssueSeverity, Site, Uom } from '@techbuilder/contracts';
import { useSession } from '../../stores/session';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';

type Tab = 'expense' | 'progress' | 'material' | 'issue';

const TABS: { key: Tab; label: string }[] = [
  { key: 'expense', label: '💸 Expense' },
  { key: 'progress', label: '📝 Progress' },
  { key: 'material', label: '🧱 Material' },
  { key: 'issue', label: '⚠️ Issue' },
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['FOOD', 'SUPPLIES', 'TRANSPORT', 'LABOUR', 'REPAIR', 'MISC'];
const ISSUE_SEVERITIES: IssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];
const UOMS: Uom[] = ['BAG', 'KG', 'CFT', 'NOS', 'MT', 'LITRE'];

export default function RecordsScreen() {
  const { t } = useTranslation();
  const clients = useSession((s) => s.clients);

  const [activeTab, setActiveTab] = useState<Tab>('expense');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Expense state
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('MISC');
  const [expenseAmountRs, setExpenseAmountRs] = useState('');

  // Progress state
  const [progressText, setProgressText] = useState('');

  // Material state
  const [materialId, setMaterialId] = useState('');
  const [materialQty, setMaterialQty] = useState('');
  const [materialUom, setMaterialUom] = useState<Uom>('BAG');

  // Issue state
  const [issueSeverity, setIssueSeverity] = useState<IssueSeverity>('LOW');
  const [issueDescription, setIssueDescription] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(() => {
    void clients.records.listSites().then((p) => {
      if (p.items[0]) setSiteId(p.items[0].id);
    });
  }, [clients]);

  useFocusEffect(load);

  function resetSaved() {
    setSaved(false);
  }

  async function saveExpense(): Promise<void> {
    if (!siteId || !expenseAmountRs) return;
    setBusy(true);
    resetSaved();
    try {
      await clients.records.createExpense({
        id: uuidv7(),
        siteId,
        category: expenseCategory,
        amountPaise: Math.round(parseFloat(expenseAmountRs) * 100),
        businessDate: today,
      });
      setExpenseAmountRs('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveProgress(): Promise<void> {
    if (!siteId || !progressText) return;
    setBusy(true);
    resetSaved();
    try {
      await clients.records.createProgressNote({
        id: uuidv7(),
        siteId,
        text: progressText,
        businessDate: today,
      });
      setProgressText('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveMaterial(): Promise<void> {
    if (!siteId || !materialId || !materialQty) return;
    setBusy(true);
    resetSaved();
    try {
      await clients.records.createMaterialTxn({
        id: uuidv7(),
        type: 'CONSUME',
        materialId,
        qty: parseFloat(materialQty),
        uom: materialUom,
        siteId,
        businessDate: today,
      });
      setMaterialId('');
      setMaterialQty('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function saveIssue(): Promise<void> {
    if (!siteId || !issueDescription) return;
    setBusy(true);
    resetSaved();
    try {
      await clients.records.createIssue({
        id: uuidv7(),
        siteId,
        severity: issueSeverity,
        description: issueDescription,
        businessDate: today,
      });
      setIssueDescription('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  function handleSave(): void {
    if (activeTab === 'expense') void saveExpense();
    else if (activeTab === 'progress') void saveProgress();
    else if (activeTab === 'material') void saveMaterial();
    else if (activeTab === 'issue') void saveIssue();
  }

  return (
    <Screen>
      <ScrollView>
        <Text className="mb-3 text-2xl font-bold">
          {t('nav.records', 'Records')}
        </Text>
        <Text className="mb-3 text-sm text-gray-500">{today}</Text>

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => { setActiveTab(tab.key); setSaved(false); }}
                className={`rounded-full px-4 py-2 ${activeTab === tab.key ? 'bg-brand' : 'bg-gray-200'}`}
              >
                <Text className={activeTab === tab.key ? 'text-white' : 'text-gray-900'}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Expense form */}
        {activeTab === 'expense' ? (
          <View className="rounded-2xl border border-gray-200 p-4">
            <Text className="mb-2 text-lg font-semibold">
              {t('siteManager.addExpense', 'Add Expense')}
            </Text>
            <Text className="mb-1 text-sm font-medium text-gray-700">
              {t('siteManager.category', 'Category')}
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setExpenseCategory(c)}
                  className={`rounded-full px-3 py-2 ${expenseCategory === c ? 'bg-brand' : 'bg-gray-200'}`}
                >
                  <Text className={expenseCategory === c ? 'text-white' : 'text-gray-900'}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Field
              label={t('siteManager.amountRs', 'Amount (₹)')}
              value={expenseAmountRs}
              onChangeText={setExpenseAmountRs}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
        ) : null}

        {/* Progress form */}
        {activeTab === 'progress' ? (
          <View className="rounded-2xl border border-gray-200 p-4">
            <Text className="mb-2 text-lg font-semibold">
              {t('siteManager.addProgress', 'Add Progress Note')}
            </Text>
            <Field
              label={t('siteManager.progressText', 'Progress note')}
              value={progressText}
              onChangeText={setProgressText}
              multiline
              numberOfLines={3}
              placeholder={t('siteManager.progressPlaceholder', 'What was done today?') as string}
            />
          </View>
        ) : null}

        {/* Material form */}
        {activeTab === 'material' ? (
          <View className="rounded-2xl border border-gray-200 p-4">
            <Text className="mb-2 text-lg font-semibold">
              {t('siteManager.addMaterial', 'Material Consumption')}
            </Text>
            <Field
              label={t('siteManager.materialId', 'Material ID / Name')}
              value={materialId}
              onChangeText={setMaterialId}
              placeholder="e.g. cement"
            />
            <Field
              label={t('siteManager.qty', 'Quantity')}
              value={materialQty}
              onChangeText={setMaterialQty}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <Text className="mb-1 text-sm font-medium text-gray-700">
              {t('siteManager.uom', 'Unit')}
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {UOMS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setMaterialUom(u)}
                  className={`rounded-full px-3 py-2 ${materialUom === u ? 'bg-brand' : 'bg-gray-200'}`}
                >
                  <Text className={materialUom === u ? 'text-white' : 'text-gray-900'}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Issue form */}
        {activeTab === 'issue' ? (
          <View className="rounded-2xl border border-gray-200 p-4">
            <Text className="mb-2 text-lg font-semibold">
              {t('siteManager.addIssue', 'Raise Issue')}
            </Text>
            <Text className="mb-1 text-sm font-medium text-gray-700">
              {t('siteManager.severity', 'Severity')}
            </Text>
            <View className="mb-3 flex-row gap-2">
              {ISSUE_SEVERITIES.map((sev) => (
                <Pressable
                  key={sev}
                  onPress={() => setIssueSeverity(sev)}
                  className={`rounded-full px-3 py-2 ${issueSeverity === sev ? 'bg-brand' : 'bg-gray-200'}`}
                >
                  <Text className={issueSeverity === sev ? 'text-white' : 'text-gray-900'}>{sev}</Text>
                </Pressable>
              ))}
            </View>
            <Field
              label={t('siteManager.description', 'Description')}
              value={issueDescription}
              onChangeText={setIssueDescription}
              multiline
              numberOfLines={3}
              placeholder={t('siteManager.issuePlaceholder', 'Describe the issue…') as string}
            />
          </View>
        ) : null}

        <View className="mt-4">
          <Button
            label={busy ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
            onPress={handleSave}
            disabled={busy}
          />
        </View>

        {saved ? (
          <Text className="mt-3 text-center text-green-600">
            {t('common.saved', 'Saved!')}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
