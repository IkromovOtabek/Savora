import React from 'react';
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, tabular, type Palette } from '@/lib/theme';
import { initials } from '@/lib/format';
import type { IconName } from './Button';
import { IconSquare } from './List';

export type Tone = 'ok' | 'bad' | 'warn' | 'mut' | 'br' | 'au';

export function toneColors(c: Palette, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case 'ok': return { bg: c.okSoft, fg: c.ok };
    case 'bad': return { bg: c.badSoft, fg: c.bad };
    case 'warn': return { bg: c.warnSoft, fg: c.warn };
    case 'br': return { bg: c.tintSoft, fg: c.tint };
    case 'au': return { bg: c.goldSoft, fg: c.gold };
    default: return { bg: c.fill2, fg: c.ink2 };
  }
}

/** Holat yorlig'i. */
export function Pill({ label, tone = 'mut' }: { label: string; tone?: Tone }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillT, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Bosh harfli avatar — ismdan barqaror rang. */
export function Avatar({ name, size = 44, tone }: { name?: string | null; size?: number; tone?: keyof Palette['sq'] }) {
  const { c } = useTheme();
  const keys: (keyof Palette['sq'])[] = ['b', 'a', 'o', 'r', 'g'];
  const str = String(name || '');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const bg = c.sq[tone ?? keys[h % keys.length]];
  return (
    <View style={[s.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[s.avT, { fontSize: Math.round(size * 0.37) }]} numberOfLines={1}>{initials(name)}</Text>
    </View>
  );
}

/** Ingichka progress chizig'i (0..1). */
export function ProgressBar({ value, tone = 'br', style }: { value: number; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, value || 0));
  const fg = tone === 'br' ? c.tint : toneColors(c, tone).fg;
  return (
    <View style={[s.prog, { backgroundColor: c.fill }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 4, backgroundColor: fg }} />
    </View>
  );
}

/**
 * Faollik halqasi — SVG'siz: ikki yarim doira (chegara rangi bilan) aylantiriladi.
 * value 0..1
 */
export function Ring({ value, size = 92, stroke = 10, color, label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const { c } = useTheme();
  const p = Math.max(0, Math.min(1, value || 0));
  const col = color ?? c.tint;
  const half = size / 2;
  const arc = (rot: number, offsetLeft: number): ViewStyle => ({
    position: 'absolute', top: 0, left: offsetLeft, width: size, height: size, borderRadius: half,
    borderWidth: stroke, borderTopColor: col, borderRightColor: col,
    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
    transform: [{ rotate: `${rot}deg` }],
  });
  const rightRot = -135 + 360 * Math.min(p, 0.5);
  const leftRot = 45 + 360 * Math.max(0, p - 0.5);
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: half, borderWidth: stroke, borderColor: c.fill }} />
      {p > 0 ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: half, width: half, height: size, overflow: 'hidden' }}>
            <View style={arc(rightRot, -half)} />
          </View>
          <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
            <View style={arc(leftRot, 0)} />
          </View>
        </>
      ) : null}
      <View style={[StyleSheet.absoluteFill, s.ringCenter]}>
        <Text style={[tabular, { color: c.ink, fontWeight: '700', fontSize: Math.round(size / 5) }]} numberOfLines={1}>
          {label ?? `${Math.round(p * 100)}%`}
        </Text>
      </View>
    </View>
  );
}

/** Oq karta (soya bilan) — mini ko'rsatkichlar uchun. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, dark } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: c.cell }, !dark && { shadowColor: c.shadow, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, style]}>
      {children}
    </View>
  );
}

/** Kichik ko'rsatkich kartasi: yorliq, qiymat, izoh. */
export function StatCard({ label, value, note, color, style }: { label: string; value: string; note?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Card style={[s.stat, style]}>
      <Text style={[s.statL, { color: c.ink3 }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.statV, tabular, { color: color ?? c.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      {note ? <Text style={[s.statL, { color: c.ink3 }]} numberOfLines={1}>{note}</Text> : null}
    </Card>
  );
}

export interface TileItem {
  key: string;
  label: string;
  icon: IconName;
  color: string;
  /** O'ng yuqoridagi qisqa qiymat (masalan, qarz summasi) */
  badge?: string;
  onPress: () => void;
}

/** Modullar to'ri — 2 ustunli kulrang plitkalar: rangli ikonka + nom. Group ichida ishlatiladi. */
export function TileGrid({ items }: { items: TileItem[]; sep?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={s.tiles}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.badge ? `${it.label}, ${it.badge}` : it.label}
          style={({ pressed }) => [s.tile, { backgroundColor: c.fill2 }, pressed && { opacity: 0.55 }]}
        >
          <IconSquare icon={it.icon} color={it.color} size={46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.tileT, { color: c.ink }]} numberOfLines={2}>{it.label}</Text>
            {it.badge ? <Text style={[s.tileB, tabular, { color: c.ink3 }]} numberOfLines={1}>{it.badge}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12 },
  tileT: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, lineHeight: 20 },
  tileB: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillT: { fontSize: 12.5, fontWeight: '700' },
  av: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avT: { color: '#fff', fontWeight: '700' },
  prog: { height: 4, borderRadius: 4, overflow: 'hidden' },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 22 },
  stat: { flex: 1, padding: 14, gap: 2, minWidth: 0 },
  statL: { fontSize: 14, fontWeight: '600' },
  statV: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
});
