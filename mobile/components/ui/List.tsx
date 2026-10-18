import React from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, HAIRLINE, tabular } from '@/lib/theme';
import type { IconName } from './Button';

/** Rangli ikon kvadrati (30×30, oq ikon). */
export function IconSquare({ icon, color, size = 30 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={[s.sq, { backgroundColor: color, width: size, height: size, borderRadius: size * 0.27 }]}>
      <Ionicons name={icon} size={Math.round(size * 0.57)} color="#fff" />
    </View>
  );
}

interface GroupProps {
  children: React.ReactNode;
  header?: string;
  headerRight?: React.ReactNode;
  footer?: string;
  style?: StyleProp<ViewStyle>;
}

/** Guruhlangan (inset) ro'yxat — oq yumaloq blok, ichida ajratgichli qatorlar. */
export function Group({ children, header, headerRight, footer, style }: GroupProps) {
  const { c } = useTheme();
  const kids = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{ sep?: boolean }>[];
  return (
    <View style={style}>
      {(header || headerRight) ? (
        <View style={s.gheadRow}>
          <Text style={[s.ghead, { color: c.ink3 }]} numberOfLines={1}>{header?.toUpperCase()}</Text>
          {headerRight}
        </View>
      ) : null}
      <View style={[s.group, { backgroundColor: c.cell }]}>
        {kids.map((k, i) => React.cloneElement(k, { sep: i > 0 }))}
      </View>
      {footer ? <Text style={[s.gfoot, { color: c.ink3 }]}>{footer}</Text> : null}
    </View>
  );
}

/** Guruh sarlavhasidagi o'ng havola ("Hammasi"). */
export function GroupLink({ title, onPress }: { title: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.5 }}>
      <Text style={{ color: c.tint, fontSize: 14, fontWeight: '500' }}>{title}</Text>
    </Pressable>
  );
}

export interface CellProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  /** Chap element (Avatar) */
  left?: React.ReactNode;
  value?: string;
  valueColor?: string;
  valueStrong?: boolean;
  valueMono?: string;
  /** O'ng ustun (summa + pill) */
  right?: React.ReactNode;
  chevron?: boolean;
  checked?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Group tomonidan beriladi — yuqori ajratgich chizig'i */
  sep?: boolean;
  /** Sarlavha ostidagi qo'shimcha (ProgressBar va h.k.) */
  children?: React.ReactNode;
  titleLines?: number;
  subtitleLines?: number;
  /** Matn qiymati o'ralib ketishi mumkin (izoh) */
  wrapValue?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Cell({
  title, subtitle, icon, iconColor, left, value, valueColor, valueStrong, valueMono, right, chevron, checked,
  onPress, onLongPress, destructive, disabled, sep, children, titleLines = 1, subtitleLines = 1, wrapValue, style, accessibilityLabel,
}: CellProps) {
  const { c } = useTheme();
  const inset = left ? 66 : icon ? 58 : 16;
  const content = (pressed: boolean) => (
    <>
      {sep ? <View style={[s.sep, { left: inset, backgroundColor: c.sep }]} /> : null}
      {icon ? <IconSquare icon={icon} color={iconColor ?? c.sq.b} /> : null}
      {left}
      <View style={s.t}>
        <Text style={[s.title, { color: destructive ? c.bad : c.ink }]} numberOfLines={titleLines}>{title}</Text>
        {subtitle ? <Text style={[s.sub, { color: c.ink3 }]} numberOfLines={subtitleLines}>{subtitle}</Text> : null}
        {children}
      </View>
      {value !== undefined ? (
        <Text
          style={[
            s.value, tabular,
            { color: valueColor ?? (valueStrong ? c.ink : c.ink3) },
            valueStrong && { fontWeight: '600' },
            valueMono ? { fontFamily: valueMono, fontSize: 14 } : null,
            wrapValue && { flexShrink: 1 },
          ]}
          numberOfLines={wrapValue ? 4 : 1}
        >
          {value}
        </Text>
      ) : null}
      {right}
      {checked ? <Ionicons name="checkmark" size={20} color={c.tint} /> : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={c.ink3} style={{ opacity: 0.7, marginLeft: -4 }} /> : null}
      {pressed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: c.fill }]} pointerEvents="none" /> : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={[s.cell, style]} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>{content(false)}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, selected: !!checked }}
      style={[s.cell, disabled && { opacity: 0.45 }, style]}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** FlatList qatorlarini guruh ko'rinishiga keltirish (birinchi/oxirgi burchaklar). */
export function listCellStyle(c: { cell: string }, index: number, length: number): ViewStyle {
  return {
    backgroundColor: c.cell,
    borderTopLeftRadius: index === 0 ? 14 : 0,
    borderTopRightRadius: index === 0 ? 14 : 0,
    borderBottomLeftRadius: index === length - 1 ? 14 : 0,
    borderBottomRightRadius: index === length - 1 ? 14 : 0,
    overflow: 'hidden',
  };
}

/** O'ng ustun: summa ustida, ostida pill. */
export function AmountColumn({ amount, color, children }: { amount: string; color?: string; children?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={s.amountCol}>
      <Text style={[s.amount, tabular, { color: color ?? c.ink }]} numberOfLines={1}>{amount}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  sq: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  gheadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 6, gap: 10 },
  ghead: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2, flexShrink: 1 },
  gfoot: { fontSize: 13, paddingHorizontal: 16, paddingTop: 6, lineHeight: 18 },
  group: { borderRadius: 20, overflow: 'hidden' },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, minHeight: 48 },
  sep: { position: 'absolute', top: 0, right: 0, height: HAIRLINE },
  t: { flex: 1, minWidth: 0, paddingVertical: 11 },
  title: { fontSize: 15, fontWeight: '500', letterSpacing: -0.1 },
  sub: { fontSize: 13, marginTop: 1 },
  value: { fontSize: 15, textAlign: 'right', maxWidth: '55%' },
  amountCol: { alignItems: 'flex-end', gap: 3, flexShrink: 0, maxWidth: '50%' },
  amount: { fontSize: 15, fontWeight: '600' },
});
