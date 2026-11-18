import React, { useState } from 'react';
import { View, Pressable, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Pill, type IconName, type Tone } from '@/components/ui';
import { useTheme, tabular, HAIRLINE } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { fmtQty, qtyWithUnit } from '@/lib/qty';
import { useMarketDict } from '@/lib/marketI18n';
import { useMarketCart } from '@/lib/marketCart';
import { useBuyer } from '@/lib/buyer';
import { qtyMinOf, qtyStepOf } from '@/lib/marketCartCore';
import { imgUri, type OrderItem, type OrderStatus } from '@/lib/market';

/** Dumaloq ikon tugma + son belgisi (savat, yangi buyurtmalar). */
export function BadgeButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  const { c } = useTheme();
  const n = badge ?? 0;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={n > 0 ? `${label}, ${n}` : label}
      style={({ pressed }) => [s.iconBtn, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={24} color={c.tint} />
      {n > 0 ? (
        <View style={[s.badge, { backgroundColor: c.bad, borderColor: c.cell }]} pointerEvents="none">
          <Text style={[s.badgeT, tabular]} numberOfLines={1}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Savat tugmasi (sarlavhada) — sotuvdagi qatorlar soni bilan. */
export function CartButton() {
  const { count } = useMarketCart();
  const m = useMarketDict();
  const router = useRouter();
  return <BadgeButton icon="cart-outline" label={m.catalog.cart} badge={count} onPress={() => router.push('/market/cart')} />;
}

/** Xaridor tugmasi: kirgan bo'lsa — buyurtmalarim, aks holda kirish. */
export function AccountButton() {
  const { buyer } = useBuyer();
  const m = useMarketDict();
  const router = useRouter();
  return (
    <BadgeButton
      icon={buyer ? 'person' : 'person-outline'}
      label={buyer ? m.catalog.account : m.catalog.login}
      onPress={() => router.push(buyer ? '/market/orders' : `/market/login?next=${encodeURIComponent('/market/orders')}`)}
    />
  );
}

/** Tovar rasmi yoki o'rnida ikonka (rasm yuklanmasa ham). */
export function Thumb({ uri, size, radius = 12, style }: { uri?: string | null; size?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const src = imgUri(uri);
  const box: ViewStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: 1 };
  return (
    <View style={[box, { borderRadius: radius, backgroundColor: c.fill2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {src && !failed ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <Ionicons name="image-outline" size={size ? Math.round(size * 0.42) : 36} color={c.ink3} />
      )}
    </View>
  );
}

/**
 * Miqdor tanlagich: kasr birlikda 0,1 qadam, aks holda 1. Eng kichik qiymatda «−» o'rnida
 * savatdan o'chirish (onRemove berilsa).
 */
export function QtyStepper({ value, max, fractional, onChange, onRemove, style }: {
  value: number; max: number; fractional: boolean; onChange: (v: number) => void; onRemove?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const d = useDict();
  const m = useMarketDict();
  const step = qtyStepOf(fractional);
  const min = qtyMinOf(fractional);
  const fix = (n: number) => Math.round(n * 1000) / 1000;
  const atMin = value <= min + 1e-9;
  const removeMode = atMin && !!onRemove;
  const canDec = !atMin || removeMode;
  const canInc = max > 0 && value < max - 1e-9;
  return (
    <View style={[s.stepper, { backgroundColor: c.fill }, style]}>
      <Pressable
        onPress={() => (removeMode ? onRemove?.() : canDec && onChange(fix(Math.max(min, value - step))))}
        disabled={!canDec}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={removeMode ? m.cart.remove : d.common.decrease}
        style={({ pressed }) => [s.stepBtn, (!canDec || pressed) && { opacity: canDec ? 0.5 : 0.3 }]}
      >
        <Ionicons name={removeMode ? 'trash-outline' : 'remove'} size={removeMode ? 18 : 20} color={removeMode ? c.bad : c.ink} />
      </Pressable>
      <Text style={[s.stepVal, tabular, { color: c.ink }]} numberOfLines={1} accessibilityLabel={tr(d.common.qtyA11y, { n: fmtQty(value) })}>
        {fmtQty(value)}
      </Text>
      <Pressable
        onPress={() => canInc && onChange(fix(Math.min(max, value + step)))}
        disabled={!canInc}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={d.common.increase}
        style={({ pressed }) => [s.stepBtn, (!canInc || pressed) && { opacity: canInc ? 0.5 : 0.3 }]}
      >
        <Ionicons name="add" size={20} color={c.ink} />
      </Pressable>
    </View>
  );
}

const STATUS_TONE: Record<OrderStatus, Tone> = { new: 'br', accepted: 'warn', completed: 'ok', rejected: 'bad', cancelled: 'mut' };

/** Buyurtma holati yorlig'i (matni — chaqiruvchi lug'atidan: xaridor yoki do'kon). */
export function StatusPill({ status, labels }: { status: OrderStatus; labels: Record<OrderStatus, string> }) {
  return <Pill label={labels[status] ?? status} tone={STATUS_TONE[status] ?? 'mut'} />;
}

/** Buyurtma tovarlari: rasm, nom, miqdor × narx, jami. */
export function OrderItems({ items }: { items: OrderItem[] }) {
  const { c } = useTheme();
  const d = useDict();
  return (
    <View>
      {items.map((it, i) => (
        <View key={`${it.listingId}-${i}`} style={[s.item, i > 0 && { borderTopWidth: HAIRLINE, borderTopColor: c.sep }]}>
          <Thumb uri={it.image} size={44} radius={10} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.itemName, { color: c.ink }]} numberOfLines={2}>{it.name}</Text>
            <Text style={[s.itemSub, tabular, { color: c.ink3 }]} numberOfLines={1}>
              {qtyWithUnit(it.qty, it.unit, d.productFields.units)} × {fmtMoney(it.price)}
            </Text>
          </View>
          <Text style={[s.itemTotal, tabular, { color: c.ink }]} numberOfLines={1}>{fmtMoney(it.total)}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden', minHeight: 36 },
  stepBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepVal: { flex: 1, minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemSub: { fontSize: 13.5, fontWeight: '500', marginTop: 2 },
  itemTotal: { fontSize: 15, fontWeight: '700' },
});
