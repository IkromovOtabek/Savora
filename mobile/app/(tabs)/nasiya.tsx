import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum, fmtDate } from '@/lib/theme';

interface Sale {
  id: string; product: string; customer: string | null;
  totalAmount: number; remainingAmount: number; installmentMonths: number | null;
  dueDate: string | null; status: string;
}

function stateOf(s: Sale): { label: string; c: { bg: string; fg: string } } {
  if (s.status === 'paid' || s.remainingAmount === 0) return { label: 'To\'landi', c: tiles.green };
  if (s.dueDate && new Date(s.dueDate).getTime() < Date.now()) return { label: 'Muddat o\'tgan', c: tiles.red };
  return { label: 'Faol', c: tiles.amber };
}

export default function Nasiya() {
  const router = useRouter();
  const [items, setItems] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Sale[] }>('/api/mobile/sales?type=installment');
      setItems(r.items);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const totalRemaining = items.reduce((a, x) => a + x.remainingAmount, 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Nasiya</Text>
        <Text style={s.sub}>Jami qoldiq: {fmtSum(totalRemaining)} so'm</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 6 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListEmptyComponent={<Text style={s.empty}>Nasiya savdosi yo'q</Text>}
          renderItem={({ item }) => {
            const st = stateOf(item);
            return (
              <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => router.push(`/sale/${item.id}`)}>
                <View style={s.rowTop}>
                  <Text style={s.name} numberOfLines={1}>{item.product}</Text>
                  <View style={[s.badge, { backgroundColor: st.c.bg }]}><Text style={[s.badgeT, { color: st.c.fg }]}>{st.label}</Text></View>
                </View>
                <Text style={s.sub2}>{item.customer ?? '—'}{item.installmentMonths ? ` · ${item.installmentMonths} oy` : ''}</Text>
                <View style={s.rowBot}>
                  <Meta label="Summa" value={fmtSum(item.totalAmount)} />
                  <Meta label="Qoldiq" value={fmtSum(item.remainingAmount)} danger />
                  <Meta label="Muddat" value={fmtDate(item.dueDate)} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Meta({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View>
      <Text style={s.metaL}>{label}</Text>
      <Text style={[s.metaV, danger && { color: tiles.red.fg }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  sub2: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  rowBot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metaL: { fontSize: 11, color: colors.textFaint, marginBottom: 2 },
  metaV: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  badge: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 20 },
  badgeT: { fontSize: 11.5, fontWeight: '700' },
});
