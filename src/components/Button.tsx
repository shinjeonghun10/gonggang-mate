import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';

type Props = {
  label: string;
  onPress?: () => void;
  /** primary: 파란 버튼 / secondary: 흰 버튼 / danger: 차단 */
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
};

/** 공통 버튼. 화면에서 버튼이 필요하면 이걸 쓴다. */
export function Button({ label, onPress, variant = 'primary', disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, variant !== 'primary' && styles[`${variant}Label`]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.danger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  label: { color: colors.white, fontSize: fontSize.body, fontWeight: '700' },
  secondaryLabel: { color: colors.ink },
  dangerLabel: { color: colors.danger },
});
