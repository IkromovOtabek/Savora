import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { qtyWithUnit } from '@/lib/qty';
import { useDict } from '@/lib/i18n';

/** Server (`/api/mobile/kirim-chiqim/flow`) jami ko'rsatkichlari — web `FlowTotals` bilan bir xil */
export interface FlowTotals {
  stockQty: Record<string, number>;
  soldQty: Record<string, number>;
  stockCost: number;
  soldRevenue: number;
  profit: number;
}

/**
 * Kirim (ombordagi qiymat) / chiqim (sotuv tushumi) / foyda — web «Kirim-chiqim» sahifasidagi jami karta.
 * `onPress` berilsa — butun karta bosiladi (barcha kirim-chiqim ro'yxatiga o'tadi).
 */
export function FlowTotalCard({ totals, title, onPress, moreLabel }: {
  totals: FlowTotals; title?: string; onPress?: () => void; moreLabel?: string;
}) {
  const { c } = useTheme();
  const d = useDict();
  const k = d.kirimChiqim;
  const units = d.productFields.units;
  const qtyText = (q: Record<string, number>) => {
    const parts = Object.entries(q).filter(([, n]) => n > 0).map(([u, n]) => qtyWithUnit(n, u, units));
    return parts.length ? parts.join(' + ') : qtyWithUnit(0, null, units);
  };

  const body = (
    <Card style={s.card}>
      {title ? (
        <View style={s.head}>
          <Text style={[s.title, { color: c.ink2 }]} numberOfLines={1}>{title}</Text>
          {onPress ? <Ionicons name="chevron-forward" size={18} color={c.ink3} /> : null}
        </View>
      ) : null}
      <View style={s.sides}>
        <View style={s.side}>
          <Text style={[s.label, { color: c.ink3 }]} numberOfLines={1}>{k.stockSide}</Text>
          <Text style={[s.value, tabular, { color: c.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmtMoney(totals.stockCost)}</Text>
          <Text style={[s.label, { color: c.ink3 }]} numberOfLines={1}>{qtyText(totals.stockQty)}</Text>
        </View>
        <View style={[s.divider, { backgroundColor: c.sep }]} />
        <View style={s.side}>
          <Text style={[s.label, { color: c.ink3 }]} numberOfLines={1}>{k.soldSide}</Text>
          <Text style={[s.value, tabular, { color: c.ok }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmtMoney(totals.soldRevenue)}</Text>
          <Text style={[s.label, { color: c.ink3 }]} numberOfLines={1}>{qtyText(totals.soldQty)}</Text>
        </View>
      </View>
      <View style={[s.net, { borderTopColor: c.sep }]}>
        <Text style={[s.netL, { color: c.ink2 }]} numberOfLines={1}>{k.netProfit}</Text>
        <Text style={[s.netV, tabular, { color: totals.profit >= 0 ? c.ok : c.bad }]} numberOfLines={1}>
          {fmtMoney(totals.profit, { suffix: true })}
        </Text>
      </View>
      {onPress && moreLabel ? <Text style={[s.more, { color: c.tint }]}>{moreLabel}</Text> : null}
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, moreLabel].filter(Boolean).join(' — ')}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  sides: { flexDirection: 'row', gap: 12 },
  side: { flex: 1, gap: 2, minWidth: 0 },
  divider: { width: StyleSheet.hairlineWidth },
  label: { fontSize: 13, fontWeight: '500' },
  value: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  net: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  netL: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  netV: { fontSize: 18, fontWeight: '700' },
  more: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
});
