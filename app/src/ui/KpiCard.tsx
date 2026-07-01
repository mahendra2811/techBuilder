import { View } from 'react-native';
import { Text } from './Text';

export function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
      <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      <Text className="text-sm text-gray-500">{label}</Text>
    </View>
  );
}
