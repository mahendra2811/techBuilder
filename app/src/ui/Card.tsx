import { View, type ViewProps } from 'react-native';

export function Card({ children, ...rest }: ViewProps) {
  return (
    <View {...rest} className="rounded-2xl border border-gray-200 bg-white p-4">
      {children}
    </View>
  );
}
