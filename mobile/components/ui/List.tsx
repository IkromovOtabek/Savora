import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme, HAIRLINE, tabular } from '@/lib/theme';
import type { IconName } from './Button';

/** "#RRGGBB" ni boshqa rang bilan aralashtirish (t=0..1). */
function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/**
 * Hajmli ikon kvadrati ("Loy" yo'nalishi): yorug'dan to'qqa gradient yuz, yuqorida yaltiroq,
 * pastki qirrada qalinlik, o'z rangidagi yumshoq soya. Tugmalarga emas — faqat ikonkalarga.
 */
export function IconSquare({ icon, color, size = 40 }: { icon: IconName; color: string; size?: number }) {
  const id = React.useId().replace(/:/g, '');
  const r = size * 0.32;
  const hex = /^#[0-9a-f]{6}$/i.test(color);
  const top = hex ? mix(color, '#ffffff', 0.32) : color;
  const bot = hex ? mix(color, '#000000', 0.16) : color;
  const edge = hex ? mix(color, '#000000', 0.32) : color;
  return (
    <View style={[s.sq, { width: size, height: size, borderRadius: r, shadowColor: color }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bot} />
          </LinearGradient>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* qalinlik — pastki qirra */}
        <Rect x={0} y={0} width={size} height={size} rx={r} fill={edge} />
        <Rect x={0} y={0} width={size} height={size - size * 0.07} rx={r} fill={`url(#f${id})`} />
        {/* yaltiroq */}
        <Rect x={size * 0.12} y={size * 0.06} width={size * 0.76} height={size * 0.4} rx={size * 0.2} fill={`url(#g${id})`} />
      </Svg>
      <Ionicons name={icon} size={Math.round(size * 0.54)} color="#fff" style={s.sqIcon} />
    </View>
  );
}

interface GroupProps {
  children: React.ReactNode;
  header?: string;
  /** Sarlavha yonidagi yumshoq doiradagi ikonka */
  icon?: IconName;
  headerRight?: React.ReactNode;
  footer?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Guruhlangan ro'yxat — oq yumaloq karta. Sarlavha karta ichida: (ikonka) + qalin nom + o'ng havola,
 * ostida ajratgich, keyin qatorlar.
 */
export function Group({ children, header, icon, headerRight, footer, style }: GroupProps) {
  const { c, dark } = useTheme();
  const kids = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{ sep?: boolean }>[];
  const hasHead = !!(header || headerRight);
  return (
    <View style={style}>
      {/* iOS'da overflow:hidden soyani kesadi — soya tashqi qatlamda */}
      <View style={[s.groupOuter, { backgroundColor: c.cell }, !dark && s.groupShadow]}>
        <View style={[s.group, { backgroundColor: c.cell }]}>
          {hasHead ? (
            <View style={[s.gheadRow, { borderBottomColor: c.sep }]}>
              {icon ? (
                <View style={[s.gicon, { backgroundColor: c.tintSoft }]}>
                  <Ionicons name={icon} size={22} color={c.tint} />
                </View>
              ) : null}
              <Text style={[s.ghead, { color: c.ink }]} numberOfLines={1} accessibilityRole="header">{header}</Text>
              {headerRight}
            </View>
          ) : null}
          {kids.map((k, i) => React.cloneElement(k, { sep: i > 0 }))}
        </View>
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
  const inset = left ? 74 : icon ? 70 : 16;
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
      {chevron ? <Ionicons name="chevron-forward" size={18} color={c.ink3} style={{ opacity: 0.7, marginLeft: -4 }} /> : null}
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
    borderTopLeftRadius: index === 0 ? 22 : 0,
    borderTopRightRadius: index === 0 ? 22 : 0,
    borderBottomLeftRadius: index === length - 1 ? 22 : 0,
    borderBottomRightRadius: index === length - 1 ? 22 : 0,
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
  sq: {
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    shadowOpacity: 0.4, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  sqIcon: { marginTop: -2, textShadowColor: 'rgba(0,0,0,0.22)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  gheadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 64,
    borderBottomWidth: HAIRLINE,
  },
  gicon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  ghead: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  groupShadow: { shadowColor: '#0D1526', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  gfoot: { fontSize: 13.5, fontWeight: '500', paddingHorizontal: 16, paddingTop: 8, lineHeight: 19 },
  groupOuter: { borderRadius: 22 },
  group: { borderRadius: 22, overflow: 'hidden' },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingRight: 14, minHeight: 66 },
  sep: { position: 'absolute', top: 0, right: 0, height: HAIRLINE },
  t: { flex: 1, minWidth: 0, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sub: { fontSize: 14.5, fontWeight: '500', marginTop: 2 },
  value: { fontSize: 17, fontWeight: '600', textAlign: 'right', maxWidth: '55%' },
  amountCol: { alignItems: 'flex-end', gap: 3, flexShrink: 0, maxWidth: '50%' },
  amount: { fontSize: 17, fontWeight: '800' },
});
