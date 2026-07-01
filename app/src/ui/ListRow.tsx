import { Pressable, View } from 'react-native';
import { Text } from './Text';

export function ListRow({ title, subtitle, badge, onPress }: { title: string; subtitle?: string; badge?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="mb-2 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="text-base font-medium text-gray-900">{title}</Text>
        {subtitle ? <Text className="text-sm text-gray-500">{subtitle}</Text> : null}
      </View>
      {badge ? <Text className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{badge}</Text> : null}
    </Pressable>
  );
}
