import { Pressable, Text } from 'react-native';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

const bg = { primary: 'bg-brand', secondary: 'bg-gray-200', danger: 'bg-danger' } as const;
const fg = { primary: 'text-white', secondary: 'text-gray-900', danger: 'text-white' } as const;

/** Large tappable button — min 48dp touch target, icon+label friendly (low-literacy UX). */
export function Button({ label, onPress, variant = 'primary', disabled = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`min-h-12 items-center justify-center rounded-2xl px-5 ${bg[variant]} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-base font-semibold ${fg[variant]}`}>{label}</Text>
    </Pressable>
  );
}
