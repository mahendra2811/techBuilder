import { Text as RNText, type TextProps } from 'react-native';

/** Text primitive — accepts `className` (NativeWind). Use everywhere instead of raw RN Text. */
export function Text(props: TextProps) {
  return <RNText {...props} />;
}
