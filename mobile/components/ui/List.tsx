import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, HAIRLINE, tabular } from '@/lib/theme';
import type { IconName } from './Button';

/**
 * Hajmli ikon kvadrati — rangli yuz, yuqorida yaltiroq qatlam, pastda o'z rangidagi yumshoq soya
 * (foydalanuvchi tanlagan "Loy" yo'nalishi). Tugmalarga emas — faqat ikonkalarga.
 */
export function IconSquare({ icon, color, size = 38 }: { icon: IconName; color: string; size?: number }) {
  const r = size * 0.3;
  return (
    <View style={[s.sq, { backgroundColor: color, width: size, height: size, borderRadius: r, shadowColor: color }]}>
      <View pointerEvents="none" style={[s.sqShine, { borderTopLeftRadius: r, borderTopRightRadius: r, height: size * 0.5 }]} />
      <Ionicons name={icon} size={Math.round(size * 0.55)} color="#fff" />
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
                  <Ionicons name={icon} size={20} color={c.tint} />
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
  const inset = left ? 72 : icon ? 66 : 16;
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
    shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  sqShine: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.2)' },
  gheadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60,
    borderBottomWidth: HAIRLINE,
  },
  gicon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  ghead: { flex: 1, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  groupShadow: { shadowColor: '#0D1526', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  gfoot: { fontSize: 13.5, fontWeight: '500', paddingHorizontal: 16, paddingTop: 8, lineHeight: 19 },
  groupOuter: { borderRadius: 22 },
  group: { borderRadius: 22, overflow: 'hidden' },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, minHeight: 60 },
  sep: { position: 'absolute', top: 0, right: 0, height: HAIRLINE },
  t: { flex: 1, minWidth: 0, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  sub: { fontSize: 13.5, fontWeight: '500', marginTop: 2 },
  value: { fontSize: 16, fontWeight: '500', textAlign: 'right', maxWidth: '55%' },
  amountCol: { alignItems: 'flex-end', gap: 3, flexShrink: 0, maxWidth: '50%' },
  amount: { fontSize: 16, fontWeight: '700' },
});
