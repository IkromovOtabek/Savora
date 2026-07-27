import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum } from '@/lib/theme';

interface Sale {
  id: string; saleNo: string; product: string; customer: string | null;
  paymentType: string; totalAmount: number; remainingAmount: number; status: string;
}

const PAY: Record<string, { t: string; c: { bg: string; fg: string } }> = {
  cash: { t: 'Naqd', c: tiles.green },
  debt: { t: 'Qarz', c: tiles.red },
  installment: { t: 'Nasiya', c: tiles.amber },
  bank_credit: { t: 'Kredit', c: tiles.indigo },
};

export default function Sales() {
  const router = useRouter();
  const [type, setType] = useState<'all' | 'debt'>('all');
  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (t: string) => {
    try {
      const r = await api<{ items: Sale[] }>(`/api/mobile/sales?type=${t}`);
      setItems(r.items);
    } catch { /* pull-to-refresh qayta uriladi */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(type); }, [load, type]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.title}>Sotuvlar</Text></View>
      <View style={s.seg}>
        <Seg label="Barchasi" active={type === 'all'} onPress={() => setType('all')} />
        <Seg label="Qarzdor" active={type === 'debt'} onPress={() => setType('debt')} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 6 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(type); }} tintColor={colors.brand} />}
          ListEmptyComponent={<Text style={s.empty}>Sotuv topilmadi</Text>}
          renderItem={({ item }) => {
            const pay = PAY[item.paymentType] ?? { t: item.paymentType, c: tiles.slate };
            return (
              <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => router.push(`/sale/${item.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{item.product}</Text>
                  <Text style={s.sub} numberOfLines={1}>{item.customer ?? '—'} · {item.saleNo}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.amt}>{fmtSum(item.totalAmount)}</Text>
                  {item.remainingAmount > 0 ? (
                    <Text style={s.rem}>Qoldiq: {fmtSum(item.remainingAmount)}</Text>
                  ) : (
                    <View style={[s.badge, { backgroundColor: pay.c.bg }]}><Text style={[s.badgeT, { color: pay.c.fg }]}>{pay.t}</Text></View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.segBtn, active && s.segActive]} activeOpacity={0.8} onPress={onPress}>
      <Text style={[s.segT, active && s.segTActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  seg: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  segBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segT: { fontSize: 13.5, fontWeight: '600', color: colors.textMuted },
  segTActive: { color: '#fff' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  amt: { fontSize: 15, fontWeight: '800', color: colors.text },
  rem: { fontSize: 12, fontWeight: '600', color: tiles.red.fg },
  badge: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 20 },
  badgeT: { fontSize: 11.5, fontWeight: '700' },
});
