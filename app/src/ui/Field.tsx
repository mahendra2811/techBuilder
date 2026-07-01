import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
}

/** Labelled text input. Prefer numeric/tap input where possible (low-literacy UX); use keyboardType. */
export function Field({ label, ...rest }: Props) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
      <TextInput {...rest} className="min-h-12 rounded-xl border border-gray-300 px-4" />
    </View>
  );
}
