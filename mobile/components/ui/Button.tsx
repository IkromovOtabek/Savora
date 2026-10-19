import React from 'react';
import { Pressable, ActivityIndicator, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tabular } from '@/lib/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  /** O'ng tomondagi qiymat (masalan, summa) — bo'lsa matn chapga, qiymat o'ngga */
  value?: string;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  capsule?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** iOS uslubidagi tekis tugma — bosilganda xiralashadi (opacity .5). */
export function Button({
  title, onPress, variant = 'filled', size = 'md', icon, value, loading, disabled, full, capsule, style, accessibilityLabel,
}: ButtonProps) {
  const { c } = useTheme();
  const pal = {
    filled: { bg: c.tintFill, fg: c.onTint },
    tinted: { bg: c.tintSoft, fg: c.tint },
    gray: { bg: c.fill, fg: c.ink },
    plain: { bg: 'transparent', fg: c.tint },
    destructive: { bg: c.badSoft, fg: c.bad },
  }[variant];
  const sz = {
    sm: { py: 6, px: 12, fs: 14, r: 999, h: 34, ic: 16 },
    md: { py: 12, px: 18, fs: 16, r: 16, h: 50, ic: 19 },
    // Katta asosiy tugma — to'liq "pill" (BILLZ'dagi «To'lash ··· summa» kabi)
    lg: { py: 16, px: 22, fs: 18, r: 999, h: 58, ic: 21 },
  }[size];
  const off = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      hitSlop={size === 'sm' ? 6 : 0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        s.base,
        {
          backgroundColor: pal.bg, minHeight: sz.h, paddingVertical: sz.py,
          paddingHorizontal: variant === 'plain' ? 4 : sz.px, borderRadius: capsule ? 999 : sz.r,
          justifyContent: value ? 'space-between' : 'center',
        },
        full && { alignSelf: 'stretch' },
        disabled && !loading && { opacity: 0.35 },
        pressed && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={pal.fg} />
      ) : (
        <>
          <View style={s.left}>
            {icon ? <Ionicons name={icon} size={sz.ic} color={pal.fg} /> : null}
            <Text style={[s.text, { color: pal.fg, fontSize: sz.fs }]} numberOfLines={1}>{title}</Text>
          </View>
          {value ? <Text style={[s.text, tabular, { color: pal.fg, fontSize: sz.fs }]} numberOfLines={1}>{value}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

/** Kichik dumaloq ikon tugma (navbar uchun) — 44pt bosish maydoni. */
export function IconButton({ icon, onPress, label, tone = 'fill' }: { icon: IconName; onPress: () => void; label: string; tone?: 'fill' | 'plain' }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.icon,
        { backgroundColor: tone === 'fill' ? c.fill : 'transparent' },
        pressed && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={24} color={c.tint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  text: { fontWeight: '700', letterSpacing: -0.2 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
