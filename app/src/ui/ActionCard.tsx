import { Pressable } from 'react-native';
import { Text } from './Text';

/** Large tappable home-screen card (icon optional via emoji for now; low-literacy: big target + label). */
export function ActionCard({ label, sublabel, emoji, onPress }: { label: string; sublabel?: string; emoji?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="min-h-28 flex-1 justify-center rounded-2xl border border-gray-200 bg-white p-4">
      {emoji ? <Text className="mb-1 text-3xl">{emoji}</Text> : null}
      <Text className="text-lg font-semibold text-gray-900">{label}</Text>
      {sublabel ? <Text className="text-sm text-gray-500">{sublabel}</Text> : null}
    </Pressable>
  );
}
