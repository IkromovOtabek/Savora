import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from '@/lib/theme';

/** Forma bo'limi — oq yumaloq karta, ixtiyoriy qalin sarlavha bilan. */
export function FormCard({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, dark } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: c.cell }, !dark && s.shadow, style]}>
      {title ? <Text style={[s.title, { color: c.ink }]} accessibilityRole="header">{title}</Text> : null}
      {children}
    </View>
  );
}

/** Tanlov qatori: chapda nom, o'ngda tanlangan qiymat (yoki «Tanlanmagan») va ko'k strelka. */
export function PickRow({ label, value, placeholder, onPress }: {
  label: string; value?: string | null; placeholder: string; onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value || placeholder}`}
      style={({ pressed }) => [s.row, { backgroundColor: c.fill2 }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[s.rowLabel, { color: c.ink2 }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.rowValue, { color: value ? c.ink : c.ink3 }]} numberOfLines={1}>{value || placeholder}</Text>
      <Ionicons name="chevron-forward" size={20} color={c.tint} />
    </Pressable>
  );
}

/** Ro'yxat tepasidagi «+ Yangi … qo'shish» havolasi. */
export function AddRow({ title, onPress }: { title: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.add, pressed && { opacity: 0.5 }]}>
      <Ionicons name="add" size={26} color={c.tint} />
      <Text style={[s.addT, { color: c.tint }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

/** Maydon ichidagi kichik matnli tugma («Yaratish»). */
export function InlineAction({ title, onPress, icon }: { title?: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.inline, { backgroundColor: c.tintSoft }, pressed && { opacity: 0.5 }]}
    >
      {icon ? <Ionicons name={icon} size={18} color={c.tint} /> : null}
      {title ? <Text style={[s.inlineT, { color: c.tint }]}>{title}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 14 },
  shadow: { shadowColor: '#0D1526', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, minHeight: 56 },
  rowLabel: { fontSize: 16, fontWeight: '600', flexShrink: 0, maxWidth: '55%' },
  rowValue: { flex: 1, fontSize: 16, fontWeight: '500', textAlign: 'right' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  addT: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, minHeight: 34 },
  inlineT: { fontSize: 14, fontWeight: '700' },
});
